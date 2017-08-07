# react-native-sass-classname
Babel plugin to make react web app more reusable as react-native apps and vice-versa.

## Prerequirements
- Babel being used to transpile your project.

## What is the purpose of this plugin?
Indeed, react-native is a great alternative to frontend engineers feel comfortable working on mobile apps. Also, the effort invested by [Nicolas Gallagher][necolas-url] creating components replace the native ones, it is very valuable. Despite the previous sentences be great advantages in this battle for productivity (having more people capable of doing the tasks), migration is not straight forward. Especially, due to the aspect of the same apps look different in mobile and web view. Besides, the react-native which came after has a particular syntax to apply visual effects, that is the absence of className property widely used in web apps. So, rather than we adapt ourselves to this new reality, it is totally feasible adapting the new reality to the existing web environment, thus, making a migration seamless and painless.

The only gotcha here is that any engineer can use a module resolver to create their own replacement for native components. It has not been said undervaluing the [React Native Web][react-native-web-url] package developed by Nicolas. So, then, why? The reason for that is that creating your own replacement as a proper web component, you can take advantage of className property and using this babel plugin it takes care of the conversion from className to style property.

## How to use?
Execute in your package/project folder:
```
npm install babel-plugin-react-native-sass-classname
// or
yarn add babel-plugin-react-native-sass-classname
```
Then, have your .babelrc ready with the plugin set:
```
{
  "presets": [
    "react-native"
  ],
  "plugins": [
    ["react-native-sass", {
      "extension": ["css", "scss", "sass"],
      "prefixExtension": "native"
    }]
  ],
  "ignore": "node_modules"
}
```
By default we already have the options below set, so, it is not required to set as it is displayed above.
- extension: ["css", "scss", "sass"]
- prefixExtension: "native"

## How would look like my app?
As it has been said, creating aliases engineers will be able to have a DIV (web) represented by a VIEW (native):
```
const View = ({ children, ...otherProps }) => <div {...otherProps}>{children}</div>;
```
And a SPAN (web) by TEXT (native):
```
const Text = ({ children, ...otherProps }) => <span {...otherProps}>{children}</span>;
```
So, building a seamless app, they would have:

Application.js
```
import React from 'react';
import {
  Text,
  View
} from 'react-native'; // of course, you will need to map your module resolver to grab your own polyfills (custom Text and View)

import styles from './SplashScreen.scss';

const Application = (() => (
  <View
    className={[styles.container, styles.transparentContainer].join(' ')}
    style={{opacity: .8}}
  >
    <View className={styles.content}>
      <Text className={styles.helloworld}>Hello world!</Text>
    </View>
  </View>
));
```

Application.scss
```
.container {
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  position: absolute;
}

.transparentContainer {
  background-color: rgba(0,0,0,0);
}

.content {
  flex: 1;
  justify-content: center;
  align-items: center;
}

.helloworld {
  flex: 1;
}

```

Application.native.scss
```
.container {
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  position: absolute;
}

.transparentContainer {
  background-color: rgba(100, 190, 150, 80);
}

.content {
  flex: 1;
  justify-content: center;
  align-items: center;
}

.helloworld {
  flex: 1;
}
```

For the native apps, the `scss` consumed by the app it is going to be the `Application.native.scss`. This can be changed if the engineers set their custom prefix extension `"prefixExtension": "my-native"`, thus, the end file consumed would be `Application.my-native.scss`. So, the file is read and the css properties are converted into style properties and applied to the components.

## Limitations
Basically, components accept the following syntaxes:
- `className={styles.myCustomClass}`
- `className={[styles.myCustomClass, styles.myMinifiedClass].join(' ')}` very import to keep with the `' '` otherwise, the result is messed up.
- `className={styles.myCustomClass} style={{ color:'#ff558d' }}` merging the properties will take the last ones as the highest priority
- `className={[styles.myCustomClass, styles.myMinifiedClass].join(' ')} style={{ color:'#ff558d' }}` merging the properties will take the last ones as the highest priority

## License
MIT

## Contributions are welcome
Send your PR and help making the web/native development more exciting.

[react-native-web-url]: https://github.com/necolas/react-native-web
[necolas-url]: https://github.com/necolas

