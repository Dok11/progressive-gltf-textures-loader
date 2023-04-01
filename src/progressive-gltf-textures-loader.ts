import { Engine } from '@babylonjs/core/Engines/engine';
import { ISceneLoaderPlugin, ISceneLoaderPluginAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Scene } from '@babylonjs/core/scene';
import { GLTFFileLoader } from '@babylonjs/loaders/glTF/glTFFileLoader';


export interface ProgressiveGltfTexturesLoaderOptions {
  /**
   * BabylonJS engine uses to create scene for textures loading.
   */
  engine: Engine;

  /**
   * Array of rules to match URLs of the resources that GLTFLoader loads.
   */
  rules: {
    /**
     * URL matcher that can contain wildcard `*`.
     * For example, for URL https://www.babylonjs.com/Assets/DamagedHelmet/glTF/Default_normal.jpg
     * you can use:
     * - /Assets/DamagedHelmet/glTF/*.jpg
     * - /Assets/DamagedHelmet/glTF/Default_normal.jpg
     */
    match: string | string[];

    /**
     * Variations of optimized textures from low to high quality.
     * Values are used by `replacer` function, so you can use any format you want.
     */
    variations: unknown[];
  }[];

  /**
   * Function that replaces URL of the resource to new by the config matched.
   * @param url URL of the resource that GLTFLoader loads.
   * @param config Config of the rule that matched.
   * @param variation Variation of the config that matched.
   */
  replacer: (
    url: string,
    config: ProgressiveGltfTexturesLoaderOptions['rules'][number],
    variation: ProgressiveGltfTexturesLoaderOptions['rules'][number]['variations'][number],
  ) => string;
}


/**
 * Texture with defined URL.
 */
type TextureWithUrl = Texture & { url: string; };


export class ProgressiveGltfTexturesLoader extends GLTFFileLoader {
  private readonly options: ProgressiveGltfTexturesLoaderOptions;

  /**
   * Map of replaced URLs to original URLs.
   * @private
   */
  private static readonly replaceHistory: Map<string, {
    // index of ProgressiveGltfTexturesLoaderOptions['rules'][number]['variations']
    variationIndex: number;
    replacerRule: ProgressiveGltfTexturesLoaderOptions['rules'][number];
  }> = new Map();

  private static sceneForTextures: Scene;


  constructor(options: ProgressiveGltfTexturesLoaderOptions) {
    super();

    this.options = options;

    /**
     * We should create a new scene for textures loading because
     * we need to disable delayed texture loading.
     */
    if (!ProgressiveGltfTexturesLoader.sceneForTextures) {
      ProgressiveGltfTexturesLoader.sceneForTextures = new Scene(this.options.engine);
      ProgressiveGltfTexturesLoader.sceneForTextures.useDelayedTextureLoading = false;
    }
  }


  /**
   * Override GLTFFileLoader.createPlugin to return our plugin.
   */
  public override createPlugin(): ISceneLoaderPlugin | ISceneLoaderPluginAsync {
    return new ProgressiveGltfTexturesLoader(this.options);
  }


  /**
   * Override GLTFFileLoader.preprocessUrlAsync to replace URL of the resource
   * to new by the config matched.
   * @param url URL of the resource that GLTFLoader trying to load.
   * @returns URL of the resource that GLTFLoader should load.
   */
  public override preprocessUrlAsync = (url: string): Promise<string> => {
    const progressiveReplaceMatch = this.options.rules.find(config => {
      const matches = Array.isArray(config.match) ? config.match : [config.match];

      return matches.some(match => {
        const regex = new RegExp(match.replace(/\*/g, '.*'));

        return regex.test(url);
      });
    });

    if (progressiveReplaceMatch) {
      const variation = progressiveReplaceMatch.variations[0];

      if (variation) {
        const newUrl = this.options.replacer(url, progressiveReplaceMatch, variation);

        ProgressiveGltfTexturesLoader.replaceHistory.set(url, {
          variationIndex: 0,
          replacerRule: progressiveReplaceMatch,
        });

        url = newUrl;
      }
    }

    return Promise.resolve(url);
  };


  /**
   * Method that runs progressively textures loading for the mesh.
   */
  public initProgressiveLoading(mesh: AbstractMesh): void {
    if (!mesh.material) {
      return;
    }

    mesh.material.getActiveTextures()
      .filter(ProgressiveGltfTexturesLoader.isTexture)
      .forEach(texture => this.loadNextTextureUrl(texture));
  }


  /**
   * Method that loads next texture variation.
   * @param texture - Texture to load next variation.
   * @param once - If true, then load only one variation, without chain for the next.
   */
  private loadNextTextureUrl(texture: TextureWithUrl, once?: boolean): void {
    // If texture doesn't have metadata, then we add here the original URL.
    ProgressiveGltfTexturesLoader.setOriginalUrl(texture, texture.metadata.originalUrl);

    // Get the next URL and variation for the texture.
    const nextUrlData = this.getNextUrl(texture.metadata.originalUrl);

    const onLoadCallback = (!nextUrlData.isLast && !once)
      ? () => this.loadNextTextureUrl(texture)
      : undefined;

    // Create a new virtual texture with the next URL and load it.
    const newTexture = new Texture(
      nextUrlData.url,
      ProgressiveGltfTexturesLoader.sceneForTextures,
      nextUrlData.isLast ? texture.noMipmap : false,
      texture.invertY,
      texture.samplingMode,
      () => {
        // When the new texture is loaded, we update the original texture.
        newTexture.readPixels()?.then(pixels => {
          texture.updateURL(nextUrlData.url, pixels, () => {
            onLoadCallback?.();
            newTexture.dispose();
          });
        });
      });

    const history = ProgressiveGltfTexturesLoader.replaceHistory.get(texture.metadata.originalUrl);

    if (history) {
      history.variationIndex++;
    }
  }


  private getNextUrl(url: string): { url: string; isLast: boolean } {
    const historyForTexture = ProgressiveGltfTexturesLoader.replaceHistory.get(url);

    if (!historyForTexture) {
      return { url, isLast: true };
    }

    const variations = historyForTexture.replacerRule.variations;
    const lastIndex = variations.length - 1;
    const nextIndex = historyForTexture.variationIndex + 1;
    const nextVariation = variations[nextIndex] || variations[lastIndex];

    return {
      url: this.options.replacer(url, historyForTexture.replacerRule, nextVariation),
      isLast: nextIndex === lastIndex,
    };
  }


  private static isTexture(texture: unknown): texture is TextureWithUrl {
    return (texture as Texture).url !== undefined;
  }


  private static setOriginalUrl(texture: TextureWithUrl, url: string): void {
    if (!texture.metadata) {
      texture.metadata = {};
    }

    if (!texture.metadata.originalUrl) {
      texture.metadata.originalUrl = texture.url.replace(/^data:/, '');
    }
  }
}
