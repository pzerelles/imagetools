import { basename, extname } from 'node:path'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, opendir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import type { Plugin, ResolvedConfig } from 'vite'
import {
  applyTransforms,
  builtins,
  builtinOutputFormats,
  extractEntries,
  generateTransforms,
  getMetadata,
  parseURL,
  urlFormat,
  resolveConfigs,
  type Logger,
  type OutputFormat,
  type ProcessedImageMetadata
} from 'imagetools-core'
import { createFilter, dataToEsm } from '@rollup/pluginutils'
import sharp, { type Metadata, type Sharp } from 'sharp'
import { checksumFile, createBasePath, generateCacheID, generateImageID } from './utils.js'
import type { VitePluginOptions } from './types.js'

export type {
  Include,
  Exclude,
  DefaultDirectives,
  ExtendTransforms,
  ExtendOutputFormats,
  ResolveConfigs,
  VitePluginOptions
} from './types.js'

const defaultOptions: VitePluginOptions = {
  include: /^[^?]+\.(avif|gif|heif|jpeg|jpg|png|tiff|webp)(\?.*)?$/,
  exclude: 'public/**/*',
  removeMetadata: true,
  cacheRetention: 86400
}

interface ProcessedCachableImageMetadata extends ProcessedImageMetadata {
  imagePath?: string
}

export * from 'imagetools-core'

export function imagetools(userOptions: Partial<VitePluginOptions> = {}): Plugin {
  const pluginOptions: VitePluginOptions = { ...defaultOptions, ...userOptions }

  const filter = createFilter(pluginOptions.include, pluginOptions.exclude)

  const transformFactories = pluginOptions.extendTransforms ? pluginOptions.extendTransforms(builtins) : builtins

  const outputFormats: Record<string, OutputFormat> = pluginOptions.extendOutputFormats
    ? pluginOptions.extendOutputFormats(builtinOutputFormats)
    : builtinOutputFormats

  let viteConfig: ResolvedConfig
  let basePath: string

  const processPath = process.cwd()

  const generatedImages = new Map<string, Sharp | ProcessedCachableImageMetadata>()

  const isSharp = (image: Sharp | ProcessedCachableImageMetadata): image is Sharp => typeof image.clone === 'function'

  return {
    name: 'imagetools',
    enforce: 'pre',
    configResolved(cfg) {
      viteConfig = cfg
      basePath = createBasePath(viteConfig.base)
    },
    async load(id) {
      if (!filter(id)) return null

      const srcURL = parseURL(id)
      const pathname = decodeURIComponent(srcURL.pathname)

      // lazy loaders so that we can load the metadata in defaultDirectives if needed
      // but if there are no directives then we can just skip loading
      let lazyImg: Sharp
      const lazyLoadImage = () => {
        if (lazyImg) return lazyImg
        return (lazyImg = sharp(pathname))
      }

      let lazyMetadata: Metadata
      const lazyLoadMetadata = async () => {
        if (lazyMetadata) return lazyMetadata
        return (lazyMetadata = await lazyLoadImage().metadata())
      }

      const defaultDirectives =
        typeof pluginOptions.defaultDirectives === 'function'
          ? await pluginOptions.defaultDirectives(srcURL, lazyLoadMetadata)
          : pluginOptions.defaultDirectives || new URLSearchParams()
      const directives = new URLSearchParams({
        ...Object.fromEntries(defaultDirectives),
        ...Object.fromEntries(srcURL.searchParams)
      })

      if (!directives.toString()) return null

      const outputMetadatas: Array<ProcessedImageMetadata> = []

      const logger: Logger = {
        info: (msg) => viteConfig.logger.info(msg),
        warn: (msg) => this.warn(msg),
        error: (msg) => this.error(msg)
      }

      const relativeID = id.startsWith(processPath) ? id.slice(processPath.length + 1) : id
      const cacheID = pluginOptions.cacheDir ? generateCacheID(relativeID) : undefined
      if (cacheID && pluginOptions.cacheDir && existsSync(`${pluginOptions.cacheDir}/${cacheID}/index.json`)) {
        try {
          const srcChecksum = await checksumFile('sha1', pathname)
          const { checksum, metadatas } = JSON.parse(
            await readFile(`${pluginOptions.cacheDir}/${cacheID}/index.json`, { encoding: 'utf8' })
          )

          if (srcChecksum === checksum) {
            const date = new Date()
            utimes(`${pluginOptions.cacheDir}/${cacheID}/index.json`, date, date)

            for (const metadata of metadatas) {
              if (directives.has('inline')) {
                metadata.src = `data:image/${metadata.format};base64,${(await readFile(metadata.imagePath)).toString(
                  'base64'
                )}`
              } else {
                if (viteConfig.command === 'serve') {
                  const imageID = metadata.imageID
                  generatedImages.set(imageID, metadata)
                  metadata.src = basePath + imageID
                } else {
                  const fileHandle = this.emitFile({
                    name: basename(pathname, extname(pathname)) + `.${metadata.format}`,
                    source: await readFile(metadata.imagePath),
                    type: 'asset'
                  })

                  metadata.src = `__VITE_ASSET__${fileHandle}__`
                }
              }
              outputMetadatas.push(metadata)
            }
          }
        } catch (e) {
          console.error('cache error:', e)
          outputMetadatas.length = 0
        }
      }

      if (!outputMetadatas.length) {
        const img = lazyLoadImage()
        const widthParam = directives.get('w')
        const heightParam = directives.get('h')
        if (directives.get('allowUpscale') !== 'true' && (widthParam || heightParam)) {
          const metadata = await lazyLoadMetadata()
          const clamp = (s: string, intrinsic: number) =>
            [...new Set(s.split(';').map((d): string => (parseInt(d) <= intrinsic ? d : intrinsic.toString())))].join(
              ';'
            )

          if (widthParam) {
            const intrinsicWidth = metadata.width || 0
            directives.set('w', clamp(widthParam, intrinsicWidth))
          }

          if (heightParam) {
            const intrinsicHeight = metadata.height || 0
            directives.set('h', clamp(heightParam, intrinsicHeight))
          }
        }

        const parameters = extractEntries(directives)
        const imageConfigs =
          pluginOptions.resolveConfigs?.(parameters, outputFormats) ?? resolveConfigs(parameters, outputFormats)

        for (const config of imageConfigs) {
          const { transforms } = generateTransforms(config, transformFactories, srcURL.searchParams, logger)
          const { image, metadata } = await applyTransforms(transforms, img.clone(), pluginOptions.removeMetadata)
          const imageBuffer = await image.toBuffer()
          const imageID = await generateImageID(srcURL, config, imageBuffer)

          if (directives.has('inline')) {
            metadata.src = `data:image/${metadata.format};base64,${imageBuffer.toString('base64')}`
          } else {
            if (viteConfig.command === 'serve') {
              generatedImages.set(imageID, image)
              metadata.src = basePath + imageID
            } else {
              const fileHandle = this.emitFile({
                name: basename(pathname, extname(pathname)) + `.${metadata.format}`,
                source: imageBuffer,
                type: 'asset'
              })

              metadata.src = `__VITE_ASSET__${fileHandle}__`
            }
          }

          metadata.imageID = imageID
          metadata.image = image

          outputMetadatas.push(metadata as ProcessedImageMetadata)
        }

        if (pluginOptions.cacheDir) {
          const relativeID = id.startsWith(processPath) ? id.slice(processPath.length + 1) : id
          const cacheID = generateCacheID(relativeID)
          try {
            const checksum = await checksumFile('sha1', pathname)
            await mkdir(`${pluginOptions.cacheDir}/${cacheID}`, { recursive: true })
            await Promise.all(
              outputMetadatas.map(async (metadata) => {
                const { format, image, imageID } = metadata
                const imagePath = `${pluginOptions.cacheDir}/${cacheID}/${imageID}.${format}`
                if (image) await writeFile(imagePath, await image.toBuffer())
                metadata.imagePath = imagePath
                if (viteConfig.command === 'serve') {
                  generatedImages.set(id, metadata)
                }
              })
            )
            await writeFile(
              `${pluginOptions.cacheDir}/${cacheID}/index.json`,
              JSON.stringify({
                checksum,
                created: Date.now(),
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                metadatas: outputMetadatas.map(({ src, image, ...metadata }) => metadata)
              }),
              { encoding: 'utf8' }
            )
          } catch (e) {
            console.debug(`failed to create cache for ${cacheID}`)
            await rm(`${pluginOptions.cacheDir}/${cacheID}`, { recursive: true })
          }
        }
      }

      let outputFormat = urlFormat()
      const asParam = directives.get('as')?.split(':')
      const as = asParam ? asParam[0] : undefined
      for (const [key, format] of Object.entries(outputFormats)) {
        if (as === key) {
          outputFormat = format(asParam && asParam[1] ? asParam[1].split(';') : undefined)
          break
        }
      }

      return dataToEsm(await outputFormat(outputMetadatas), {
        namedExports: pluginOptions.namedExports ?? viteConfig.json?.namedExports ?? true,
        compact: !!viteConfig.build.minify ?? false,
        preferConst: true
      })
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith(basePath)) {
          const [, id] = req.url.split(basePath)

          const image = generatedImages.get(id)

          if (!image)
            throw new Error(`vite-imagetools cannot find image with id "${id}" this is likely an internal error`)

          res.setHeader('Cache-Control', 'max-age=360000')

          if (isSharp(image)) {
            if (pluginOptions.removeMetadata === false) {
              image.withMetadata()
            }

            res.setHeader('Content-Type', `image/${getMetadata(image, 'format')}`)
            return image.clone().pipe(res)
          } else if (image.imagePath) {
            res.setHeader('Content-Type', `image/${image.format}`)
            return createReadStream(image.imagePath).pipe(res)
          } else {
            throw new Error(`vite-imagetools cannot find image with id "${id}" this is likely an internal error`)
          }
        }

        next()
      })
    },

    async buildEnd(error) {
      if (!error && pluginOptions.cacheDir && pluginOptions.cacheRetention && viteConfig.command !== 'serve') {
        const dir = await opendir(pluginOptions.cacheDir)
        for await (const dirent of dir) {
          if (dirent.isDirectory()) {
            const cacheDir = `${pluginOptions.cacheDir}/${dirent.name}`
            try {
              const stats = await stat(`${cacheDir}/index.json`)
              if (Date.now() - stats.mtimeMs > pluginOptions.cacheRetention * 1000) {
                console.debug(`deleting stale cache dir ${dirent.name}`)
                await rm(cacheDir, { recursive: true })
              }
            } catch (e) {
              console.debug(`deleting invalid cache dir ${dirent.name}`)
              await rm(cacheDir, { recursive: true })
            }
          }
        }
      }
    }
  }
}
