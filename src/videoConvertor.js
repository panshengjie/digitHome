import ffmpegStatic from "ffmpeg-static"
import ffmpeg from "fluent-ffmpeg"
import nodePath from "path"
import { spawn } from 'child_process'
import detectCharacterEncoding from 'detect-character-encoding'
import fs from "fs-extra"
ffmpeg.setFfmpegPath(ffmpegStatic.path)

let targetsFiles = [".mkv", ".mp4", ".avi", "wmv", "mov", ".rmvb", ".rm"]
let threads = 1;

class VideoConvertor {
    constructor(dir) {
        this.state = {
            doing: [],
            todos: []
        }
        this.watchDIR = dir
        this.srcDirs = []
        log(`[VC]watchDIR ${dir}`)

        this.config = {
            x265: (src) => {
                let cmd = ffmpeg(src, { niceness: -19 })
                    .addOptions(["-max_muxing_queue_size 9999", "-map 0", "-c:s copy", "-c:v libx265",
                        "-preset medium", "-x265-params crf=22:pools=4", "-c:a aac", "-b:a 192k"
                    ])
                return this.createJob("x265", src, cmd)
            },
            toAAC: (src) => {
                let cmd = ffmpeg(src, { niceness: -18 })
                    .addOptions(["-max_muxing_queue_size 9999", "-map 0", "-c:v copy",
                        "-c:a aac", "-b:a 192k", "-threads 3"
                    ])
                return this.createJob("toAAC", src, cmd)
            },
            mobile: (src) => {
                let cmd = ffmpeg(src, { niceness: -17 })
                    .addOptions(["-max_muxing_queue_size 9999", "-map 0", "-c:s copy",
                        "-c:v libx264", "-pix_fmt yuv420p", "-preset veryfast", "-s 1280x720",
                        "-r 24", "-crf 24", "-threads 3", "-c:a aac", "-b:a 92k"
                    ])
                return this.createJob("mobile", src, cmd)
            }
        }

        for (let p in this.config) {
            fs.mkdirpSync(nodePath.join(dir, p))
            fs.mkdirpSync(nodePath.join(dir, p, "src"))
            fs.mkdirpSync(nodePath.join(dir, p, "done"))
            this.srcDirs.push(nodePath.join(dir, p, "src"))
        }
        fs.removeSync(nodePath.join(this.watchDIR, "lock"))
        this._scan()
        setInterval(this._scan, 60 * 60 * 1000)
    }

    _scan = (dir, type) => {
        if (!dir) { //fully scan
            if (this.state.doing.length) // no scan when is working
                return;
            for (let p in this.config) {
                this._scan(nodePath.join(this.watchDIR, p, "src"), p)
            }
        } else if (type) {
            fs.readdir(dir)
                .then(files => {
                    let jobCnt = 0;
                    let ps = files.map(async (file) => {
                        let abs = nodePath.join(dir, file)
                        let stats = await fs.stat(abs)

                        if (stats.isDirectory()) {
                            jobCnt++;
                            this._scan(abs, type)
                        } else {
                            let ext = nodePath.extname(file)
                            let ext_lc = ext.toLowerCase()
                            if (ext !== ext_lc) {
                                await fs.move(file, file.replace(ext, ext_lc))
                            }
                            if (targetsFiles.contains(ext_lc)) {
                                jobCnt++;
                                this.add(abs, type)
                            }
                        }
                    })
                    return Promise.all(ps).then(() => {
                        if (!jobCnt && !this.srcDirs.contains(dir)) {
                            fs.remove(dir).catch(e => error(e))
                        }
                    })
                })
                .catch(e => { error(e) })
        }
    }
    _onJobStart = (job) => {
        fs.writeFile(nodePath.join(this.watchDIR, "lock"), `${job.src} -> ${job.dest}`, 'utf8')
        this.state.doing.push(job)
        log(`[VC][${job.type}][start]${nodePath.basename(job.src)}, #remain ${this.state.todos.length} jobs`)
        job.progressPrintTimer = setInterval(() => {
            log(`[MC][${job.type}][${job.progress}][${nodePath.basename(job.src)}]`)
        }, 30 * 1000)
    }
    _onJobFinish = (job, err) => {
        if (job.progressPrintTimer) {
            clearInterval(job.progressPrintTimer)
            delete job.progressPrintTimer
        }
        this.state.doing.remove(job)
        if (this.state.doing.length < threads) {
            this._spin()
        }
        if (!err) {
            fs.remove(job.src).catch(e => error(e))
        }
    }
    _spin = () => {
        if (this.state.todos.length) {
            let c = threads - this.state.doing.length
            while (c--) {
                let job = this.state.todos.shift()
                job && job.run()
            }
        }

        if (!this.state.todos.length && !this.state.doing.length) {
            fs.remove(nodePath.join(this.watchDIR, "lock")).catch(e => error(e))
            log(`[VC][idle]:all jobs done`)
            this._scan()
        }
    }
    createJob = (type, src, cmd) => {
        let dest = nodePath.join(nodePath.dirname(src), nodePath.basename(src).replace(nodePath.extname(src), ".mkv")).replace("src", "done")
        let job = {
            src: src,
            dest: dest,
            type: type,
            cmd: cmd.output(dest),
        }

        job.run = () => {
            fs.mkdirp(nodePath.dirname(job.dest)).catch(e => {})
            this._onJobStart(job)
            job.cmd.on('progress', ({ percent }) => {
                    job.progress = Math.round(percent)
                })
                .on('error', (err) => {
                    error(`[MC][${job.type}][error][${nodePath.basename(job.src)}]: ${err.message}`)
                    this._onJobFinish(job, err)
                })
                .on('end', () => {
                    log(`[MC][${job.type}][done][${nodePath.basename(job.src)}]`)
                    this._onJobFinish(job)
                })
            job.stop = () => {
                this.cmd.kill()
            }
            job.pause = () => {
                this.cmd.kill('SIGSTOP')
            }
            job.resume = () => {
                this.cmd.kill('SIGCONT')
            }
            job.cmd.run()
        }

        return job
    }
    add = (src, type = "mobile") => {
        this.state.todos.push(this.config[type](src))
        if (this.state.doing.length < threads)
            this._spin()
    }
    remove = (src) => {
        log(`[VC][RM]${nodePath.basename(src)}`)
        this.state.todos.remove(j => j.src === src)
    }
}

export default VideoConvertor
