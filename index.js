var types = require('babel-types');
var sass = require('node-sass');
var reactNativeCSS = require('react-native-css').default;
var fs = require('fs');

var polyfillMerge = `
Array.$mergeItems = function $mergeItems(merged, item) {
  return Object.assign(merged, item);
};
Array.prototype.$merge = Array.prototype.$merge || function $merge() {
  var list = this;
  return list.reduce(Array.$mergeItems, {});
};
`;

var cache = {
  isMergePolyfilled: false,
};

function importContent(filePath) {
  if (!cache[filePath]) {
    var data = fs.readFileSync(filePath).toString('utf-8');
    cache[filePath] = {
      rawData: data,
      compiled: reactNativeCSS(data),
      importedVariables: {}
    };
  }
  return cache[filePath];
}

var DIRECTORY_SEPARATOR = '/';
var EXTENSION_SEPARATOR = '.';
var NATIVE_PREFIX_EXTENSION = 'native';


function isValidSourceFile(filePath, extensions) {
  var extension = filePath.split(EXTENSION_SEPARATOR).pop().toLowerCase();
  return extensions.filter(function (ext) {
    return extension === ext;
  }).length > 0;
}

/**
 * Gets the specific path to native styles
 * @param {string} filePath
 * @param {array<string>} extensions
 */
function parsePath(filePath, nativeExtensionPrefix, extensions) {
  var path = filePath.split(EXTENSION_SEPARATOR);
  path.pop();
  var fullPathWithoutExtension = path.join(EXTENSION_SEPARATOR);
  var extension = extensions.filter(function (ext) {
    return fs.existsSync([
      fullPathWithoutExtension,
      EXTENSION_SEPARATOR,
      nativeExtensionPrefix,
      EXTENSION_SEPARATOR,
      ext
    ].join(''));
  }).pop();
  return [
    fullPathWithoutExtension,
    EXTENSION_SEPARATOR,
    nativeExtensionPrefix,
    EXTENSION_SEPARATOR,
    extension
  ].join('');
}

/**
 * Gets the relative path from this transformer
 * @param {string} source - relative path to importer file name, e.g. (../src/component.js)
 * @param {string} target - style file name
 */
function getCssFilePath(source, target) {
  var pathFileNodes = source.split(DIRECTORY_SEPARATOR);
  pathFileNodes.pop();
  pathFileNodes.push(target.split(DIRECTORY_SEPARATOR).pop());
  var cssFilePath = pathFileNodes.join(DIRECTORY_SEPARATOR);
  return cssFilePath;
}

function isJoinExpression(path, t) {
  return path.node.value.expression.callee
  && path.node.value.expression.callee.property
  && path.node.value.expression.callee.property.name
  && path.node.value.expression.callee.property.name.toLowerCase() === 'join'
  && t.isArrayExpression(path.node.value.expression.callee.object)
}

module.exports = function ({ Plugin, types: t}) {

  function importResolver(path, state) {
    var file = state.file;
    var fileOpts = file.opts;
    var node = path.node;
    var styles = path.scope.bindings.styles;
    var extra = node.source.extra;
    var specifiers = node.specifiers;
    // style file name
    var targetFileName = node.source.value;
    // path from root to importer the file name, e.g. (src/component.js)
    var sourceFileName = [process.cwd(), fileOpts.filename].join(DIRECTORY_SEPARATOR);
    var cssFilePath = getCssFilePath(sourceFileName, targetFileName);
    var extensions = (path.opts.extensions || ['css', 'scss', 'sass']).map(function(ext) {
      return ext.toLowerCase();
    });
    var prefixExtension = path.opts.prefixExtension || NATIVE_PREFIX_EXTENSION;

    if (!node || !isValidSourceFile(targetFileName, extensions) || types.isIdentifier(node)) return;

    var source = parsePath(
      cssFilePath,
      prefixExtension,
      extensions
    );
    var data = importContent(source);
    var { compiled: stylesAsObject } = data;
    if (styles && !Object.keys(data.importedVariables).includes(sourceFileName)) {
      data.importedVariables[sourceFileName] = styles.identifier.name;
    }
    var templateLiteral = [
      'var',
      data.importedVariables[sourceFileName],
      '=',
      JSON.stringify(stylesAsObject),
      ';',
      (!cache.isMergePolyfilled) && polyfillMerge
    ].join(' ');

    cache.isMergePolyfilled = true;
    path.replaceWith(t.identifier(templateLiteral));
  }

  var pragma, expression;
  var style, css;

  return {
    visitor: {
      ImportDeclaration: importResolver,
      JSXOpeningElement: {
        exit(path, state) {
          if (css != null) {
            var classes = [];
            if (t.isJSXExpressionContainer(css.node.value)) {
              if (css.node.value.expression && css.node.value.expression.elements) {
                console.log('ELEMENTS', css.node.value.expression.elements)
              }
              if (t.isArrayExpression(css.node.value.expression)) {
                console.log('ARRAY EXPRESSION', css.node.value.expression.elements);
                classes = classes.concat(css.node.value.expression.elements);
              } else if (isJoinExpression(css, t)) {
                  console.log('JOIN EXPRESSION', css.node.value.expression);
                  classes = classes.concat(css.node.value.expression.callee.object.elements);
              } else {
                console.log('ELSE EXPRESSION', css.node.value.expression);
                classes.push(css.node.value.expression);
              }
            }
            if (style == null) {
              style = css;
              style.node.name.name = 'style';
            } else {
              if (t.isArrayExpression(style.node.value.expression)) {
                classes = classes.concat(style.node.value.expression.elements);
              } else {
                classes.push(style.node.value.expression);
              }
              css.remove();
            }
            if (classes.length === 0) {
              style.remove();
            } else if (classes.length === 1) {
              style.node.value = t.JSXExpressionContainer(classes[0]);
            } else {
              var arrayExpression = t.ArrayExpression(classes);
              var memberMergeExpression = t.memberExpression(arrayExpression, t.identifier('$merge'))
              var callExpressionMergeAll = t.callExpression(memberMergeExpression, []);
              style.node.value = t.JSXExpressionContainer(callExpressionMergeAll);
            }
            css = null;
          }
          style = null;
        }
      },
      JSXAttribute: function JSXAttribute(path, state) {
        if (path.node.name.name === 'className') {
          css = path;
        } else if (path.node.name.name === 'style') {
          style = path;
        }
      },
      Program: function Program(path, state) {
        // Init rule for update layout
        pragma = state.opts.pragma;
        if (pragma != null) {
          pragma = pragma.split(".").map(function (name) {
            return t.identifier(name);
          }).reduce(function (object, property) {
            return t.memberExpression(object, property);
          });
        } else {
          pragma = t.identifier('styles');
        }
      }
    }
  };
}
