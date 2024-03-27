import { InlineConfig, build, createLogger } from 'vite'
import { imagetools } from '../index'
import { join } from 'path'
import { getFiles, testEntry } from './util'
import { toMatchImageSnapshot } from 'jest-image-snapshot'
import { OutputAsset, OutputChunk, RollupOutput } from 'rollup'
import { JSDOM } from 'jsdom'
import sharp from 'sharp'
import { afterEach, describe, test, expect, it, vi } from 'vitest'
import { createBasePath } from '../utils'
import { existsSync } from 'fs'
import { rm, utimes } from 'fs/promises'

expect.extend({ toMatchImageSnapshot })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('vite-imagetools', () => {
  describe('options', () => {
    describe('include', () => {
      it('accepts a string', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              include: '**/*.png?*'
            })
          ]
        })

        await expect(p).resolves.toBeDefined()
      })

      it('accepts a regex', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              include: /\w+\.png/
            })
          ]
        })

        await expect(p).resolves.toBeDefined()
      })

      it('accepts an array', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              include: ['**/*.png?*', /\w+\.png/]
            })
          ]
        })

        await expect(p).resolves.toBeDefined()
      })

      it('errors on invalid input', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'silent',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              //@ts-expect-error invalid input
              include: 100
            })
          ]
        })

        await expect(p).rejects.toBeDefined()
      })

      it('does nothing non matching import', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              include: ''
            })
          ]
        })

        await expect(p).resolves.toBeDefined()
      })
    })

    describe('exclude', () => {
      it('accepts a string', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              exclude: '**/*.jpg'
            })
          ]
        })

        await expect(p).resolves.toBeDefined()
      })

      it('accepts a regex', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              exclude: /\w+\.jpg/
            })
          ]
        })

        await expect(p).resolves.toBeDefined()
      })

      it('accepts an array', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              exclude: ['**/*.jpg?*', /\w+\.jpg/]
            })
          ]
        })

        await expect(p).resolves.toBeDefined()
      })

      it('errors on invalid input', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'silent',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              //@ts-expect-error invalid input
              exclude: 100
            })
          ]
        })

        await expect(p).rejects.toBeDefined()
      })

      it('resolves normal on non matching input', async () => {
        const p = build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({
              exclude: ''
            })
          ]
        })

        await expect(p).resolves.toBeDefined()
      })
    })

    describe('logging', () => {
      test('logs info messages to console', async () => {
        const logger = createLogger('info')
        const spy = vi.spyOn(logger, 'info')
        await build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'info',
          customLogger: logger,
          build: { write: false },
          plugins: [
            testEntry(`
                          import Image from "./with-metadata.png?warn"
                          window.__IMAGE__ = Image
                      `),
            imagetools({
              extendTransforms() {
                return [
                  (config, context) => {
                    context.logger.info('An info message')
                    return (image) => image
                  }
                ]
              },
              cache: { enabled: false }
            })
          ]
        })

        expect(spy).toHaveBeenCalledWith('An info message')
      })
      test('logs warn messages through rollup', async () => {
        const logger = createLogger('info')
        const spy = vi.spyOn(logger, 'warn')
        await build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          customLogger: logger,
          build: { write: false },
          plugins: [
            testEntry(`
                          import Image from "./with-metadata.png?warn"
                          window.__IMAGE__ = Image
                      `),
            imagetools({
              extendTransforms() {
                return [
                  (config, context) => {
                    context.logger.warn('A warning')
                    return (image) => image
                  }
                ]
              },
              cache: { enabled: false }
            })
          ]
        })

        expect(spy.mock.lastCall?.[0]).toContain('A warning')
      })
      test('logs error messages through rollup', async () => {
        try {
          await build({
            root: join(__dirname, '__fixtures__'),
            logLevel: 'warn',
            build: { write: false },
            plugins: [
              testEntry(`
                            import Image from "./with-metadata.png?warn"
                            window.__IMAGE__ = Image
                        `),
              imagetools({
                extendTransforms() {
                  return [
                    (config, context) => {
                      context.logger.error('An error')
                      return (image) => image
                    }
                  ]
                },
                cache: { enabled: false }
              })
            ]
          })
          fail()
        } catch (err: unknown) {
          const e = err as { plugin: string; message: string }
          expect(e.plugin).toEqual('imagetools')
          expect(e.message).toContain('An error')
        }
      })
    })

    describe('removeMetadata', () => {
      test('true removes private metadata', async () => {
        const bundle = (await build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./with-metadata.png?as=metadata"
                            window.__IMAGE__ = Image
                        `),
            imagetools({
              removeMetadata: true
            })
          ]
        })) as RollupOutput | RollupOutput[]

        const files = getFiles(bundle, '**.png') as OutputAsset[]

        const metadata = await sharp(files[0].source as Buffer).metadata()

        expect(metadata).not.toHaveProperty('xmp')
      })

      test('false leaves private metadata', async () => {
        const dir = './node_modules/.cache/imagetools_test_false_leaves_private_metadata'
        await rm(dir, { recursive: true, force: true })
        const bundle = (await build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./with-metadata.png?as=metadata"
                            window.__IMAGE__ = Image
                        `),
            imagetools({
              removeMetadata: false,
              cache: { dir }
            })
          ]
        })) as RollupOutput | RollupOutput[]

        const files = getFiles(bundle, '**.png') as OutputAsset[]

        const metadata = await sharp(files[0].source as Buffer).metadata()

        expect(metadata).toHaveProperty('xmp')
      })
    })

    describe('resolveConfigs', () => {
      test('can be used to generate multiple images (presets)', async () => {
        const bundle = (await build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./with-metadata.png?as=metadata"
                            window.__IMAGE__ = Image
                        `),
            imagetools({
              resolveConfigs() {
                return [{ w: '300' }, { w: '500' }]
              }
            })
          ]
        })) as RollupOutput | RollupOutput[]

        const files = getFiles(bundle, '**.png') as OutputAsset[]
        expect(files).toHaveLength(2)
      })
    })

    describe('defaultDirectives', () => {
      test('const', async () => {
        const bundle = (await build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./with-metadata.png"
                            window.__IMAGE__ = Image
                        `),
            imagetools({
              defaultDirectives: new URLSearchParams('w=300;500')
            })
          ]
        })) as RollupOutput | RollupOutput[]

        const files = getFiles(bundle, '**.png') as OutputAsset[]
        expect(files).toHaveLength(2)
      })

      test('function', async () => {
        const bundle = (await build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./with-metadata.png?mypreset"
                            window.__IMAGE__ = Image
                        `),
            imagetools({
              defaultDirectives: (id) => {
                if (id.searchParams.has('mypreset')) {
                  return new URLSearchParams('w=300;500')
                }
                return new URLSearchParams()
              }
            })
          ]
        })) as RollupOutput | RollupOutput[]

        const files = getFiles(bundle, '**.png') as OutputAsset[]
        expect(files).toHaveLength(2)
      })

      test('function with with metadata import', async () => {
        const bundle = (await build({
          root: join(__dirname, '__fixtures__'),
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                import Image from "./with-metadata.png?mypreset"
                window.__IMAGE__ = Image
            `),
            imagetools({
              defaultDirectives: (id) => {
                if (id.searchParams.has('mypreset')) {
                  return new URLSearchParams('as=metadata')
                }
                return new URLSearchParams()
              }
            })
          ]
        })) as RollupOutput | RollupOutput[]

        const files = getFiles(bundle, '**.js') as OutputChunk[]
        const { window } = new JSDOM(``, { runScripts: 'outside-only' })
        window.eval(files[0].code)

        expect(window.__IMAGE__).toHaveProperty('width')
        expect(window.__IMAGE__).toHaveProperty('height')
        expect(window.__IMAGE__).toHaveProperty('format')
        expect(window.__IMAGE__).toHaveProperty('src')
        expect(window.__IMAGE__).toHaveProperty('space')
        expect(window.__IMAGE__).toHaveProperty('channels')
        expect(window.__IMAGE__).toHaveProperty('depth')
        expect(window.__IMAGE__).toHaveProperty('density')
        expect(window.__IMAGE__).toHaveProperty('isProgressive')
        expect(window.__IMAGE__).toHaveProperty('hasProfile')
        expect(window.__IMAGE__).toHaveProperty('hasAlpha')
      })
    })
    describe('cache.retention', () => {
      test('is used to clear cache with default 86400', async () => {
        const dir = './node_modules/.cache/imagetools_test_cache_retention'
        await rm(dir, { recursive: true, force: true })
        const root = join(__dirname, '__fixtures__')
        const config: (width: number) => InlineConfig = (width) => ({
          root,
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=${width}"
                            export default Image
                        `),
            imagetools({ cache: { dir } })
          ]
        })
        await build(config(300))
        expect(existsSync(`${dir}/436a701f0301386167e47006781708d0ed589f03`)).toBe(true)

        await build(config(200))
        expect(existsSync(`${dir}/b8e9e77ecb7bc3cb7b552021ca9c9352814cc8de`)).toBe(true)

        const date = new Date(Date.now() - 86400000)
        await utimes(`${dir}/436a701f0301386167e47006781708d0ed589f03`, date, date)
        await build(config(200))
        expect(existsSync(`${dir}/436a701f0301386167e47006781708d0ed589f03`)).toBe(false)
      })
    })
    describe('cache.dir', () => {
      test('is used', async () => {
        const dir = './node_modules/.cache/imagetools_test_cache_dir'
        await rm(dir, { recursive: true, force: true })
        const root = join(__dirname, '__fixtures__')
        await build({
          root,
          logLevel: 'warn',
          build: { write: false },
          plugins: [
            testEntry(`
                            import Image from "./pexels-allec-gomes-5195763.png?w=300"
                            export default Image
                        `),
            imagetools({ cache: { dir } })
          ]
        })

        expect(existsSync(`${dir}/436a701f0301386167e47006781708d0ed589f03`)).toBe(true)
      })
    })
  })

  test('relative import', async () => {
    const bundle = (await build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                    import Image from "./pexels-allec-gomes-5195763.png?w=300"
                    export default Image
                `),
        imagetools()
      ]
    })) as RollupOutput | RollupOutput[]

    const files = getFiles(bundle, '**.png') as OutputAsset[]
    expect(files[0].source).toMatchImageSnapshot()
  })

  test('absolute import', async () => {
    const imagePath = join(__dirname, '__fixtures__/pexels-allec-gomes-5195763.png')

    const bundle = (await build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                    import Image from "${imagePath}?w=300"
                    export default Image
                `),
        imagetools()
      ]
    })) as RollupOutput | RollupOutput[]

    const files = getFiles(bundle, '**.png') as OutputAsset[]
    expect(files[0].source).toMatchImageSnapshot()
  })

  test('import with space in identifier', async () => {
    const bundle = (await build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                    import Image from "./with space.png?w=300"
                    export default Image
                `),
        imagetools()
      ]
    })) as RollupOutput | RollupOutput[]

    const files = getFiles(bundle, '**.png') as OutputAsset[]
    expect(files[0].source).toMatchImageSnapshot()
  })

  test('import with space in identifier and cache', async () => {
    const dir = './node_modules/.cache/imagetools_test_import_with_space'
    await rm(dir, { recursive: true, force: true })
    const config: InlineConfig = {
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                    import Image from "./with space.png?w=300"
                    export default Image
                `),
        imagetools({ cache: { dir } })
      ]
    }
    await build(config)
    const bundle = (await build(config)) as RollupOutput | RollupOutput[]

    const files = getFiles(bundle, '**.png') as OutputAsset[]
    expect(files[0].source).toMatchImageSnapshot()
  })

  test('non existent file', async () => {
    const p = build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                    import Image from "./invalid.png?w=300"
                    export default Image
                `),
        imagetools()
      ]
    })

    await expect(p).rejects.toBeDefined()
  })

  test('no directives', async () => {
    const p = build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                import Image from "./pexels-allec-gomes-5195763.png"
                    export default Image
                `),
        imagetools()
      ]
    })

    await expect(p).resolves.toBeDefined()
  })

  test('metadata import', async () => {
    const bundle = (await build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                    import Image from "./pexels-allec-gomes-5195763.png?as=metadata"
                    window.__IMAGE__ = Image
                `),
        imagetools()
      ]
    })) as RollupOutput | RollupOutput[]

    const files = getFiles(bundle, '**.js') as OutputChunk[]
    const { window } = new JSDOM(``, { runScripts: 'outside-only' })
    window.eval(files[0].code)

    expect(window.__IMAGE__).toHaveProperty('width')
    expect(window.__IMAGE__).toHaveProperty('height')
    expect(window.__IMAGE__).toHaveProperty('format')
    expect(window.__IMAGE__).toHaveProperty('src')
    expect(window.__IMAGE__).toHaveProperty('space')
    expect(window.__IMAGE__).toHaveProperty('channels')
    expect(window.__IMAGE__).toHaveProperty('depth')
    expect(window.__IMAGE__).toHaveProperty('density')
    expect(window.__IMAGE__).toHaveProperty('isProgressive')
    expect(window.__IMAGE__).toHaveProperty('hasProfile')
    expect(window.__IMAGE__).toHaveProperty('hasAlpha')
  })

  test('destructured metadata import', async () => {
    const bundle = (await build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                    import { width, height, format } from "./pexels-allec-gomes-5195763.png?as=metadata"
                    window.__IMAGE__ = { width, height, format }
                `),
        imagetools()
      ]
    })) as RollupOutput | RollupOutput[]

    const files = getFiles(bundle, '**.js') as OutputChunk[]
    const { window } = new JSDOM(``, { runScripts: 'outside-only' })
    window.eval(files[0].code)

    expect(window.__IMAGE__).toHaveProperty('width')
    expect(window.__IMAGE__).toHaveProperty('height')
    expect(window.__IMAGE__).toHaveProperty('format')
  })

  test('metadata import with whitelist', async () => {
    const bundle = (await build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                    import { width, format } from "./pexels-allec-gomes-5195763.png?as=metadata:width;format"
                    window.__IMAGE__ = { width, format }
                `),
        imagetools()
      ]
    })) as RollupOutput | RollupOutput[]

    const files = getFiles(bundle, '**.js') as OutputChunk[]
    const { window } = new JSDOM(``, { runScripts: 'outside-only' })
    window.eval(files[0].code)

    expect(window.__IMAGE__).toHaveProperty('width')
    expect(window.__IMAGE__).toHaveProperty('format')
    expect(window.__IMAGE__).not.toHaveProperty('height')
  })

  test('srcset', async () => {
    const bundle = (await build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
                        import Image from "./with-metadata.png?as=srcset"
                        window.__IMAGE__ = Image
                    `),
        imagetools()
      ]
    })) as RollupOutput | RollupOutput[]

    const files = getFiles(bundle, '**.js') as OutputChunk[]
    const { window } = new JSDOM(``, { runScripts: 'outside-only' })
    window.eval(files[0].code)

    expect(window.__IMAGE__).toBe('/assets/with-metadata-D_H5Cxui.png 600w')
  })

  test('async output format', async () => {
    const bundle = (await build({
      root: join(__dirname, '__fixtures__'),
      logLevel: 'warn',
      build: { write: false },
      plugins: [
        testEntry(`
          import Image from "./with-metadata.png?as=run"
          window.__IMAGE__ = Image
        `),
        imagetools({
          extendOutputFormats: (defaults) => ({
            ...defaults,
            run: () => () => new Promise((resolve) => setTimeout(() => resolve('success'), 500))
          })
        })
      ]
    })) as RollupOutput | RollupOutput[]

    const files = getFiles(bundle, '**.js') as OutputChunk[]
    const { window } = new JSDOM(``, { runScripts: 'outside-only' })
    window.eval(files[0].code)

    expect(window.__IMAGE__).toBe('success')
  })

  describe('utils', () => {
    test('createBasePath', () => {
      expect(createBasePath('')).toBe('/@imagetools/')
      expect(createBasePath('/')).toBe('/@imagetools/')
      expect(createBasePath('/base')).toBe('/base/@imagetools/')
      expect(createBasePath('/base/')).toBe('/base/@imagetools/')
      expect(createBasePath('http://localhost:9000/frontend')).toBe('http://localhost:9000/frontend/@imagetools/')
      expect(createBasePath('http://localhost:9000/frontend/')).toBe('http://localhost:9000/frontend/@imagetools/')
    })
  })
})
