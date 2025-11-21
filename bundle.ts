import { merge } from "lume/core/utils/object.ts";
import { log, warnUntil } from "lume/core/utils/log.ts";
import { bytes } from "lume/core/utils/format.ts";
import { prepareAsset, saveAsset } from "lume/plugins/source_maps.ts";
import { Page } from "lume/core/file.ts";

import type Site from "lume/core/site.ts";

export interface Options {
  /** File extensions to bundle */
  extensions?: string[];

  /**
   * The options for Deno.bundle
   * @see https://docs.deno.com/api/deno/~/Deno.bundle.Options
   */
  options?: Partial<Deno.bundle.Options>;
}

// Default options
export const defaults: Options = {
  extensions: [".ts", ".js", ".tsx", ".jsx", ".html"],
  options: {
    format: "esm",
    minify: true,
    platform: "browser",
  },
};

/**
 * A plugin to use Deno.bundle in Lume
 */
export function bundle(userOptions?: Options) {
  const options = merge(defaults, userOptions);

  return (site: Site) => {
    const basePath = site.src();

    async function runBundle(
      pages: Page[],
    ): Promise<[Deno.bundle.OutputFile[], boolean]> {
      let sourcemap;
      const entrypoints: string[] = [];

      pages.forEach((page) => {
        const { filename, enableSourceMap } = prepareAsset(site, page);
        if (enableSourceMap) sourcemap = "external";
        entrypoints.push(filename);
      });

      const buildOptions: Deno.bundle.Options = {
        ...options.options,
        write: false,
        entrypoints,
        sourcemap,
        outputDir: basePath,
      };
      const { outputFiles, warnings, errors } = await Deno.bundle(
        buildOptions,
      );

      if (errors.length) {
        log.error(`[bundle plugin] ${errors.length} errors `);
      }

      if (warnings.length) {
        log.warn(
          `[bundle plugin] ${warnings.length} warnings`,
        );
      }

      return [outputFiles || [], !!sourcemap];
    }

    site.process(
      options.extensions,
      async function processBundle(pages, allPages) {
        const hasPages = warnUntil(
          `[bundle plugin] No ${
            options.extensions.map((e) => e.slice(1).toUpperCase()).join(", ")
          } files found. Use <code>site.add()</code> to add files. For example: <code>site.add("script.js")</code>`,
          pages.length,
        );

        if (!hasPages) {
          return;
        }

        const [outputFiles, enableSourceMap] = await runBundle(
          pages,
        );

        const item = site.debugBar?.buildItem(
          "[bundle plugin] Build completed",
        );

        // Save the output code
        for (const output of outputFiles) {
          if (output.path.endsWith(".map")) {
            continue;
          }

          // Get the associated source map
          const map = enableSourceMap
            ? outputFiles.find((f) => f.path === `${output.path}.map`)
            : undefined;

          // Search the entry point of this output file
          const entryPoint = pages.find((page) =>
            page.sourcePath === output.path ||
            (page.sourcePath === "(generated)" &&
              page.outputPath === output.path)
          );

          // The page is a chunk
          if (!entryPoint) {
            const page = Page.create({ url: output.path });
            saveAsset(site, page, output.text(), map?.text());
            allPages.push(page);
            continue;
          }

          if (item) {
            item.items ??= [];
            item.items.push({
              title: output.path,
              details: bytes(output.text().length),
            });
          }

          // The page is an entry point
          entryPoint.data.url = output.path;
          saveAsset(site, entryPoint, output.text(), map?.text());
        }
      },
    );
  };
}

export default bundle;
