import type { UploadError, VideoUploadResult } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { DurationReader, ProxyGeneratorPort, ProxyStorage, ThumbnailGenerator, VideoStorage } from './ports'
import { VideoValidator } from './VideoValidator'

export class UploadVideoUseCase {
  private readonly validator: VideoValidator
  private readonly storage: VideoStorage
  private readonly proxyStorage: ProxyStorage
  private readonly proxyGenerator: ProxyGeneratorPort
  private readonly thumbnailGenerator: ThumbnailGenerator
  private readonly durationReader: DurationReader

  constructor(
    validator: VideoValidator,
    storage: VideoStorage,
    proxyStorage: ProxyStorage,
    proxyGenerator: ProxyGeneratorPort,
    thumbnailGenerator: ThumbnailGenerator,
    durationReader: DurationReader,
  ) {
    this.validator = validator
    this.storage = storage
    this.proxyStorage = proxyStorage
    this.proxyGenerator = proxyGenerator
    this.thumbnailGenerator = thumbnailGenerator
    this.durationReader = durationReader
  }

  async execute(
    files: File[],
    projectId: string,
    onProgress?: (file: File, progress: number) => void,
  ): Promise<Result<VideoUploadResult, UploadError>[]> {
    return Promise.all(files.map((file) => this.executeOne(file, projectId, onProgress)))
  }

  private async executeOne(
    file: File,
    projectId: string,
    onProgress?: (file: File, progress: number) => void,
  ): Promise<Result<VideoUploadResult, UploadError>> {
    const validation = this.validator.validate(file)
    if (!validation.ok) {
      return err(validation.error)
    }

    const durationResult = await this.durationReader.read(file)
    if (!durationResult.ok) {
      return err(durationResult.error)
    }

    const saveResult = await this.storage.save(file, projectId, durationResult.value)
    if (!saveResult.ok) {
      return err(saveResult.error === 'STORAGE_FULL' ? 'STORAGE_FULL' : 'UNKNOWN_ERROR')
    }

    const thumbnailResult = await this.thumbnailGenerator.generate(file)
    if (!thumbnailResult.ok) {
      return err(thumbnailResult.error)
    }

    const proxyResult = await this.proxyGenerator.generate(saveResult.value, (progress) => onProgress?.(file, progress))
    if (!proxyResult.ok) {
      return err('PROXY_GENERATION_FAILED')
    }

    const saveProxyResult = await this.proxyStorage.save(proxyResult.value)
    if (!saveProxyResult.ok) {
      return err(saveProxyResult.error === 'STORAGE_FULL' ? 'STORAGE_FULL' : 'UNKNOWN_ERROR')
    }

    return ok({ asset: saveResult.value, thumbnail: thumbnailResult.value, proxy: proxyResult.value })
  }
}
