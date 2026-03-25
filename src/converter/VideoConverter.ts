import FfmpegManager from "src/utils/FfmpegManager";
import Converter from "./Converter";
import File from "src/files/File";

export default class VideoConverter extends Converter {
    public async convert(inputFile: File, outputFile: File) {
        const command = FfmpegManager.create()
            // Video codec: libx264 with CRF 18 and fast preset
            .videoCodec("libx264")
            .outputOptions([
                "-crf", "18",
                "-preset", "fast"
            ])
            // Audio codec: AAC with 128k bitrate
            .audioCodec("aac")
            .audioBitrate("128k");

        await this.execute(inputFile, outputFile, command);
    }
}
