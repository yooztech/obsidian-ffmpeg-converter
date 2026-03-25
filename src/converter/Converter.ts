import { FfmpegCommand } from "fluent-ffmpeg";
import File from "src/files/File";
import { SettingType } from "src/setting/SettingType";

export default abstract class Converter {
    protected settings: SettingType;

    constructor(settings: SettingType) {
        this.settings = settings;
    }

    public abstract convert(inputFile: File, outputFile: File): Promise<void>;

    protected execute(inputFile: File, outputFile: File, command: FfmpegCommand) {
        return new Promise((resolve, reject) => {
            console.log("FFmpeg input:", inputFile.getFullPathWithExtension());
            console.log("FFmpeg output:", outputFile.getFullPathWithExtension());

            command
                .addOption("-y")
                .input(inputFile.getFullPathWithExtension())
                .output(outputFile.getFullPathWithExtension())
                .on("start", (cmd: string) => {
                    console.log("FFmpeg command:", cmd);
                })
                .on("stderr", (stderr: string) => {
                    console.log("FFmpeg stderr:", stderr);
                })
                .on("end", resolve)
                .on("error", (err: Error, stdout: string, stderr: string) => {
                    console.error("FFmpeg error:", err.message);
                    console.error("FFmpeg stderr:", stderr);
                    reject(err);
                })
                .run();
        });
    }
}
