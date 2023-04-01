# ProgressiveGltfTexturesLoader

A progressive textures loader for GLTF in BabylonJS. This loader allows textures
on a model to be loaded progressively from low resolution to high resolution.

There are many backend services that can create low-resolution textures from
source images. For example, I use [imgproxy.net](https://imgproxy.net/).
Imgproxy allows creating low-resolution images on-the-fly and supports options
like resizing, quality, format, blur, etc. You can install it as a standalone
service and obtain edited images via a special URL.

ProgressiveGltfTexturesLoader provides the ability to change texture URLs
on-the-fly and load low-resolution textures first, followed by high-resolution
textures. This can be particularly useful for mobile devices with slow internet
connections.

This feature offers a smoother user experience and reduces the loading time
before the model is ready to use.

![ProgressiveGltfTexturesLoader](https://user-images.githubusercontent.com/2697890/229309845-5cc6b27e-439c-49e8-bd74-82aa78d4924a.gif)

## Installation

```bash
npm install progressive-gltf-textures-loader
```

## Usage

Here's an example of how to use MoveCameraByPointer:

```ts
// Import the loader and options interface
import {
  ProgressiveGltfTexturesLoader, ProgressiveGltfTexturesLoaderOptions
} from './utils-3d/progressive-gltf-textures-loader';

// When the engine is initialized you can register the loader
SceneLoader.RegisterPlugin(new ProgressiveGltfTexturesLoader({
  // Used options described below
  engine: this.engine,
  rules: [],
  replacer: (url) => {
    return url;
  }
}));

// Get the loader instance
const gltfLoader = SceneLoader.GetPluginForExtension('.gltf') as ProgressiveGltfTexturesLoader;

// Load the model
SceneLoader.Append('https://www.babylonjs.com/Assets/DamagedHelmet/glTF/', 'DamagedHelmet.gltf', this.scene, scene => {
  // Init progressive loading for each mesh
  scene.meshes.forEach((mesh) => gltfLoader.initProgressiveLoading(mesh));
});
```

## Options

`ProgressiveGltfTexturesLoader` has various options that can be passed to the
constructor:

- `engine` - BabylonJS engine. Required.
- `rules` - Array of rules that define how to replace texture URLs. Optional.
- `replacer` - Function that defines how to replace texture URLs. Optional.

## Options example

There are an example how to configure the loader:

```ts
SceneLoader.RegisterPlugin(new ProgressiveGltfTexturesLoader({
  engine: this.engine,
  rules: [{
    match: '/Assets/DamagedHelmet/glTF/*.jpg',
    variations: [
      'rs:fill:64:64/q:80',
      'rs:fill:128:128/q:60',
      'rs:fill:256:256/q:60',
      'rs:fill:512:512/q:60',
      'q:87',
    ],
  }],
  replacer: (
    url: string,
    config: ProgressiveGltfTexturesLoaderOptions['rules'][number],
    variation: ProgressiveGltfTexturesLoaderOptions['rules'][number]['variations'][number]
  ) => {
    // Change original to URL to imgproxy path
    return `http://localhost:1234/insecure/${variation}/plain/${url}`;
  }
}));
```

- `match` - Match all textures in the model. The string can contain `*`
  wildcard. Required.
  Also you can provide an array of strings to match multiple textures, for
  example:
  ```ts
  [
    '/Assets/DamagedHelmet/glTF/*.jpg',
    '/Assets/DamagedHelmet/glTF/*.png',
  ]
  ```
- `variations` - Array of variations. Required.
  Variations are used to create progressive loading in order from first to last.
  Values will provide to `replacer` function as the third argument.
  What you put here is up to you. It can be a string, number, or any other
  value.
  Your `replacer` function is only user of this value.
- `replacer` - Function that defines how to replace texture URLs. Required.
  This function will be called for each texture in the model.
  The function receives three arguments:
    - `url` - Original texture URL.
    - `config` - Configuration object for the current texture, it is a match
      that was found.
    - `variation` - Current variation value.
      The function should return a new URL for the texture.
      In the example above, we use imgproxy on the localhost to create
      low-resolution images on-the-fly.

So, what we do in the example above:

1. After the GLTF model is loaded, we iterate over all meshes and call
   `initProgressiveLoading` method for each mesh.
2. The method will iterate over all textures in the mesh and call `replacer`
   function for each texture with related variation, first time it will be
   `rs:fill:64:64/q:80`, then `rs:fill:128:128/q:60`, etc.
3. The `replacer` function will return a new URL for the texture. In the example
   above, we use imgproxy on the localhost to create low-resolution images
   on-the-fly.
4. When this loop is finished, the texture will be loaded with `q:87`. This is
   the highest quality and the last step of progressive loading.

## Contributing

Contributions are welcome! If you'd like to contribute to this project, please
follow the standard Gitflow workflow and submit a pull request.

## Relative resources

- [Babylon.js](https://www.babylonjs.com/)
- [Default GLTF Loader](https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF)
