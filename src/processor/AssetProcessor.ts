import { App, Notice } from "obsidian";
import { ConverterFactory } from "src/converter/ConverterFactory";
import File from "src/files/File";
import { ImageExtensions, VideoExtensions, AudioExtensions, Type } from "src/formats";
import AudioLoader from "src/loader/AudioLoader";
import ImageLoader from "src/loader/ImageLoader";
import VideoLoader from "src/loader/VideoLoader";
import { SettingType } from "src/setting/SettingType";
import fs from "fs";
import Processor from "./Processor";
import { generateUniqueId } from "src/utils/uniqueId";

export default class AssetProcessor extends Processor {
    constructor(app: App, settings: SettingType) {
        super(app, settings);

        this.loaders = [
            new ImageLoader(this.app, [
                ...(this.settings.includeImageAvif ? ImageExtensions.avif : []),
                ...(this.settings.includeImageBmp ? ImageExtensions.bmp : []),
                ...(this.settings.includeImagePng ? ImageExtensions.png : []),
                ...(this.settings.includeImageJpg ? ImageExtensions.jpg : []),
                ...(this.settings.includeImageGif ? ImageExtensions.gif : []),
                ...(this.settings.includeImageWebp ? ImageExtensions.webp : []),
            ]),
            new VideoLoader(this.app, [
                ...(this.settings.includeVideoMp4 ? VideoExtensions.mp4 : []),
                ...(this.settings.includeVideoMkv ? VideoExtensions.mkv : []),
                ...(this.settings.includeVideoMov ? VideoExtensions.mov : []),
                ...(this.settings.includeVideoOgv ? VideoExtensions.ogv : []),
                ...(this.settings.includeVideoWebm ? VideoExtensions.webm : []),
            ]),
            new AudioLoader(this.app, [
                ...(this.settings.includeAudioMp3 ? AudioExtensions.mp3 : []),
                ...(this.settings.includeAudioWav ? AudioExtensions.wav : []),
                ...(this.settings.includeAudioM4a ? AudioExtensions.m4a : []),
                ...(this.settings.includeAudioFlac ? AudioExtensions.flac : []),
                ...(this.settings.includeAudioOgg ? AudioExtensions.ogg : []),
                ...(this.settings.includeAudio3gp ? AudioExtensions["3gp"] : []),
                ...(this.settings.includeAudioWebm ? AudioExtensions.webm : []),
            ]),
        ];
    }

    private getNewFileExtension(file: File) {
        const fileType = file.type;

        switch (fileType) {
            case Type.image:
                return this.settings.outputImageFormat;
            case Type.video:
                return this.settings.outputVideoFormat;
            case Type.audio:
                return this.settings.outputAudioFormat;
            default:
                throw new Error(`Unsupported file type ${file.extension}`);
        }
    }

    private async generateWorkFiles(file: File) {
        const uniqueId = generateUniqueId(this.settings.uniqueIdLength);

        // Create tmp of original file with unique suffix
        const tmpFile = file.clone({
            name: `${file.name}_${uniqueId}_tmp`,
        });

        // Create a new target file with the original name (for output)
        const targetFile = file.clone({
            name: file.name,
            extension: this.getNewFileExtension(file),
        });

        return {
            targetFile,
            tmpFile
        };
    }

    async process() {
        let progressNotice: Notice | undefined;

        for (const loader of this.loaders) {
            const files = await loader.getFiles();

            new Notice(`Found ${files.length} files to convert of type ${loader.type}`);

            const converter = ConverterFactory.createConverter(loader.type, this.settings);

            if (files.length === 0) {
                continue;
            }

            let fileIndex = 1;

            // Use of traditional for of to prevent file conflict in async programming
            for (const originalFile of files) {
                if (progressNotice) {
                    progressNotice.setMessage(`Processing file ${fileIndex}/${files.length} (${originalFile.name})`);
                }
                else {
                    progressNotice = new Notice(`Processing file ${fileIndex}/${files.length} (${originalFile.name})`, 0);
                }

                const { targetFile, tmpFile } = await this.generateWorkFiles(originalFile);

                try {
                    // Rename original file to tmp (keeps original extension for FFmpeg)
                    await this.app.fileManager.renameFile(originalFile.file, tmpFile.getVaultPathWithExtension());

                    // Convert tmp file to target file (overwrites original filename)
                    await converter.convert(tmpFile, targetFile);

                    // Remove tmp file after successful conversion
                    await this.app.vault.adapter.remove(tmpFile.getVaultPathWithExtension());

                    fileIndex++;
                }
                catch (e: unknown) {
                    // Try to restore tmp on failure
                    try {
                        if (await this.app.vault.adapter.exists(tmpFile.getVaultPathWithExtension())) {
                            await this.app.fileManager.renameFile(tmpFile.file, originalFile.file.path);
                        }
                    } catch (restoreError) {
                        console.error("Failed to restore tmp file:", restoreError);
                    }

                    new Notice(`An error occured when converting ${originalFile.file.path}, please check the developer console for more details (Ctrl+Shift+I for Windows or Linux or Cmd+Shift+I for Mac)`, 5000);
                    console.error(e);
                    break;
                }
            }
        }

        new Notice("FFmpeg conversion ended successfully");
        setTimeout(() => progressNotice?.hide(), 3000);
    }
}
