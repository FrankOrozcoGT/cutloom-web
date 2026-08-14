import type { UploadError, VideoUploadResult } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { DurationReader, ThumbnailGenerator, VideoStorage } from './ports'
import { VideoValidator } from './VideoValidator'

export class UploadVideoUseCase {
  private readonly validator: VideoValidator
  private readonly storage: VideoStorage
  private readonly thumbnailGenerator: ThumbnailGenerator
  private readonly durationReader: DurationReader

  constructor(
    validator: VideoValidator,
    storage: VideoStorage,
    thumbnailGenerator: ThumbnailGenerator,
    durationReader: DurationReader,
  ) {
    this.validator = validator
    this.storage = storage
    this.thumbnailGenerator = thumbnailGenerator
    this.durationReader = durationReader
  }

  async execute(files: File[], projectId: string): Promise<Result<VideoUploadResult, UploadError>[]> {
    return Promise.all(files.map((file) => this.executeOne(file, projectId)))
  }

  private async executeOne(file: File, projectId: string): Promise<Result<VideoUploadResult, UploadError>> {
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
      return err(saveResult.error)
    }

    const thumbnailResult = await this.thumbnailGenerator.generate(file)
    if (!thumbnailResult.ok) {
      return err(thumbnailResult.error)
    }

    return ok({ asset: saveResult.value, thumbnail: thumbnailResult.value })
  }
}
