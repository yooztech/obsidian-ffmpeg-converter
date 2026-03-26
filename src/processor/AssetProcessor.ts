import { App, Notice } from "obsidian";
import path from "path";
import { ConverterFactory } from "src/converter/ConverterFactory";
import File from "src/files/File";
import { ImageExtensions, VideoExtensions, AudioExtensions, Type } from "src/formats";
import AudioLoader from "src/loader/AudioLoader";
import ImageLoader from "src/loader/ImageLoader";
import VideoLoader from "src/loader/VideoLoader";
import { SettingType } from "src/setting/SettingType";
import fs from "fs";
import Processor from "./Processor";

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
        const targetFile = file.clone({
            name: `${file.name}_compressed`,
            extension: this.getNewFileExtension(file),
        });

        return { targetFile };
    }

    private async updateMarkdownReferences(originalPath: string, newPath: string) {
        console.log("Updating markdown references:", originalPath, "->", newPath);

        const markdownFiles = this.app.vault.getMarkdownFiles();
        const originalName = path.basename(originalPath);
        const newName = path.basename(newPath);

        console.log("Original name:", originalName, "New name:", newName);

        if (!originalName || !newName) {
            console.log("Skipping: empty names");
            return;
        }

        const lowerOriginal = originalName.toLowerCase();

        for (const mdFile of markdownFiles) {
            const content = await this.app.vault.read(mdFile);
            const lowerContent = content.toLowerCase();

            let newContent = "";
            let lastIndex = 0;
            let found = false;

            // Find all occurrences case-insensitively
            let index = lowerContent.indexOf(lowerOriginal);
            while (index !== -1) {
                found = true;
                // Copy content before match
                newContent += content.substring(lastIndex, index);
                // Add replacement
                newContent += newName;
                // Move past this match
                lastIndex = index + originalName.length;
                // Find next match
                index = lowerContent.indexOf(lowerOriginal, lastIndex);
            }

            // Add remaining content
            newContent += content.substring(lastIndex);

            if (found) {
                await this.app.vault.modify(mdFile, newContent);
                console.log(`Updated references in ${mdFile.path}: ${originalName} -> ${newName}`);
            }
        }
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

            for (const originalFile of files) {
                if (progressNotice) {
                    progressNotice.setMessage(`Processing file ${fileIndex}/${files.length} (${originalFile.name})`);
                }
                else {
                    progressNotice = new Notice(`Processing file ${fileIndex}/${files.length} (${originalFile.name})`, 0);
                }

                const { targetFile } = await this.generateWorkFiles(originalFile);

                const originalPath = originalFile.getVaultPathWithExtension();
                const targetPath = targetFile.getVaultPathWithExtension();

                try {
                    if (fs.existsSync(targetFile.getFullPathWithExtension())) {
                        await this.app.vault.adapter.remove(targetFile.getVaultPathWithExtension());
                    }

                    await converter.convert(originalFile, targetFile);

                    if (!fs.existsSync(targetFile.getFullPathWithExtension())
                        || fs.statSync(targetFile.getFullPathWithExtension()).size === 0) {
                        throw new Error("Output file is empty or was not created");
                    }

                    await this.updateMarkdownReferences(originalPath, targetPath);

                    await this.app.vault.adapter.remove(originalFile.file.path);

                    fileIndex++;
                }
                catch (e: unknown) {
                    try {
                        if (fs.existsSync(targetFile.getFullPathWithExtension())) {
                            await this.app.vault.adapter.remove(targetFile.getVaultPathWithExtension());
                        }
                    }
                    catch (cleanupError) {
                        console.error("Failed to clean up output file:", cleanupError);
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
