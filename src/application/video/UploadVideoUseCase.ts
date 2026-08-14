import type { UploadError, VideoUploadResult } from '@domain/video'
import { err, ok, type Result } from '@application/result'
import type { ThumbnailGenerator, VideoStorage } from './ports'
import { VideoValidator } from './VideoValidator'

export class UploadVideoUseCase {
  private readonly validator: VideoValidator
  private readonly storage: VideoStorage
  private readonly thumbnailGenerator: ThumbnailGenerator

  constructor(validator: VideoValidator, storage: VideoStorage, thumbnailGenerator: ThumbnailGenerator) {
    this.validator = validator
    this.storage = storage
    this.thumbnailGenerator = thumbnailGenerator
  }

  async execute(files: File[], projectId: string): Promise<Result<VideoUploadResult, UploadError>[]> {
    return Promise.all(files.map((file) => this.executeOne(file, projectId)))
  }

  private async executeOne(file: File, projectId: string): Promise<Result<VideoUploadResult, UploadError>> {
    const validation = this.validator.validate(file)
    if (!validation.ok) {
      return err(validation.error)
    }

    const saveResult = await this.storage.save(file, projectId)
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
