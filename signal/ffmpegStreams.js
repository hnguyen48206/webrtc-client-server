const pathToFfmpeg = require('@ffmpeg-installer/ffmpeg').path;
const { v4: uuidv4 } = require('uuid');
Buffer = require('buffer').Buffer;
const kill = require('terminate');
const events = require('events');
const { spawn } = require('node:child_process');

module.exports = class ffmpegStream {
    constructor(url) {
        this.url = url,
        this.eventEmitter = new events.EventEmitter();
    }
    startStream = () => {
        let command = this.getArgs(this.url, null)
        console.log(command)
        this.streamID = uuidv4();
        this.child = spawn(pathToFfmpeg, command, { shell: true });
        let buff = Buffer.from('');
        let self=this;
        this.child.stdout.on('data', function (data) {
            let offset, offset2;
            if(!self.startTime)
            self.startTime = new Date();
            if(!self.streamStatus)
            this.streamStatus=1;
            //The image can be composed of one or multiple chunk when receiving stream data.
            //Store all bytes into an array until we meet flag "FF D9" that mean it's the end of the image then we can send all data in order to display the full image.
            if (data.length > 1) {
                buff = Buffer.concat([buff, data]);

                offset = data[data.length - 2].toString(16);
                offset2 = data[data.length - 1].toString(16);

                if (offset == "ff" && offset2 == "d9") {
                    self.currentFrame = buff.toString('base64');
                    self.eventEmitter.emit('newFrame', self.currentFrame);
                    buff = Buffer.from('');
                }
                // self.eventEmitter.emit('newFrame', data)
            }
        });
        this.child.stderr.on('data', function (data) {
            console.log('FFmpeg Error ---- ', data);
            self.streamStatus = 0;
        });
        this.child.on('close', function (code) {
            console.log('Process Killed')
            self.streamStatus = 0;
        }.bind(this));
        this.child.on('error', function (err) {
            self.streamStatus=0
            if (err.code === 'ENOENT') {
                console.log('FFMpeg executable wasn\'t found. Install this package and check FFMpeg.cmd property');
            } else {
                console.log(err);
            }
        });
    }
    getArgs = (inputStream, startTime) => {
        if (startTime == null)
            return [
                '-loglevel', 'quiet',
                '-i', inputStream,
                // '-r', '10',
                '-q:v', '3',
                '-f', 'image2',
                '-update', '1',
                '-'
            ];
        else
            return [
                '-loglevel', 'quiet',
                '-ss', startTime,
                '-i', inputStream,
                // '-r', '10',
                '-q:v', '3',
                '-f', 'image2',
                '-update', '1',
                '-'
            ];
    }
    getStreamInfo = () =>
    {
        return {
            url:this.url,
            id:this.streamID,
            frame:this.currentFrame,
            status:this.streamStatus,
            process:this.child
        }
    }
    stopStream = () =>
    {
        kill(this.child.pid, function (err) {
            this.streamStatus = 0;
            if (err) { // you will get an error if you did not supply a valid process.pid
                console.log('Oopsy:', err); // handle errors in your preferred way.
            }
            else {
                console.log('done killing'); // terminating the Processes succeeded.
                // NOTE: The above won't be run in this example as the process itself will be killed before.
            }
        });
    }
}

