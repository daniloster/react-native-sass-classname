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
function getStyleSheetFullFilePath(source, target) {
  var pathFileNodes = source.split(DIRECTORY_SEPARATOR);
  pathFileNodes.pop();
  pathFileNodes.push(target.split(DIRECTORY_SEPARATOR).pop());
  var fullFilePath = pathFileNodes.join(DIRECTORY_SEPARATOR);
  return fullFilePath;
}

function isJoinExpression(path, t) {
  return path.node.value.expression.callee
  && path.node.value.expression.callee.property
  && path.node.value.expression.callee.property.name
  && path.node.value.expression.callee.property.name.toLowerCase() === 'join'
  && t.isArrayExpression(path.node.value.expression.callee.object)
}

function getAllowedExtensions(pathObject) {
  return ((pathObject.opts || {}).extensions || ['css', 'scss', 'sass']).map(function(ext) {
    return ext.toLowerCase();
  });
}

function getPrefixExtension(pathObject) {
  return (pathObject.opts || {}).prefixExtension || NATIVE_PREFIX_EXTENSION;
}

module.exports = function ({ Plugin, types: t}) {

  function importResolver(path, state) {
    var file = state.file;
    var fileOpts = file.opts;
    var node = path.node;
    var styles = node.specifiers && node.specifiers.length && node.specifiers[0].local && node.specifiers[0].local.name;
    var extra = node.source.extra;
    var specifiers = node.specifiers;

    if (!styles) {
      return;
    }
    // style file name
    var targetFileName = node.source.value;
    // path from root to importer the file name, e.g. (src/component.js)
    isAbsolutePath = /^((\w[:](\/)+)|\/)/.test(fileOpts.filename);
    prefixAbsolutePath = (isAbsolutePath ? [] : [process.cwd()]);
    var sourceFileName =  prefixAbsolutePath.concat(fileOpts.filename).join(DIRECTORY_SEPARATOR);
    var styleSheetFullFilePath = getStyleSheetFullFilePath(sourceFileName, targetFileName);
    var extensions = getAllowedExtensions(path);
    var prefixExtension = getPrefixExtension(path);

    if (!node || !isValidSourceFile(targetFileName, extensions) || types.isIdentifier(node)) return;

    var source = parsePath(
      styleSheetFullFilePath,
      prefixExtension,
      extensions
    );
    var data = importContent(source);
    var { compiled: stylesAsObject } = data;
    var hashImportedVariables = [sourceFileName, styleSheetFullFilePath].join('|');
    if (!Object.keys(data.importedVariables).includes(hashImportedVariables)) {
      data.importedVariables[hashImportedVariables] = styles;
    }
    var templateLiteral = [
      'var',
      data.importedVariables[hashImportedVariables],
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
              if (t.isArrayExpression(css.node.value.expression)) {
                classes = classes.concat(css.node.value.expression.elements);
              } else if (isJoinExpression(css, t)) {
                  classes = classes.concat(css.node.value.expression.callee.object.elements);
              } else {
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
              if (style === css) {
                var classExpression = classes[0];
                var hasTheJSXExpressionContainerAssigned = style.node.value && style.node.value.type === 'JSXExpressionContainer'
                  && style.node.value.expression === classExpression;
                if (!hasTheJSXExpressionContainerAssigned) {
                  style.node.value = t.JSXExpressionContainer(classExpression);
                }
              }
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
