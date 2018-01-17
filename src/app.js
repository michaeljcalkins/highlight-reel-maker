"use strict";

const _ = require("lodash");
const dialog = require("electron").remote.dialog;
const fs = require("fs");
const async = require("async");
const exec = require("child_process").exec;
const app = require("electron").remote.app;
const path = require("path");
const ffprobe = require("ffprobe");
const ffprobeStatic = require("ffprobe-static");
const sanitize = require("sanitize-filename");
const isImage = require("is-image");

new Vue({
  el: "#app",
  data: {
    activeView: "videos",
    isRendering: false,
    isPreviewRendering: false,
    list: [],
    audioFile: null
  },
  computed: {
    // a computed getter
    videoLength: function() {
      // `this` points to the vm instance
      return this.list
        .map(function(item) {
          return item.duration;
        })
        .reduce(function(total, num) {
          return total + Number(num);
        }, 0);
    }
  },
  methods: {
    setActiveView: function(view) {
      this.activeView = view;
    },
    importAudioFile: function() {
      self = this;
      var openedFile = dialog.showOpenDialog({
        properties: ["openFile"]
      });
      if (!openedFile) return;

      this.audioFile = {
        name: openedFile[0]
      };
    },
    removeAudioFile: function() {
      this.audioFile = null;
    },
    getImageThumbnail(file) {
      return path.join(app.getPath("downloads"), sanitize(file) + ".png");
    },
    createVideoThumbnail: function(file) {
      let self = this;
      const imageFile = path.join(app.getPath("downloads"), sanitize(file) + ".png");
      exec(
        __dirname + "/ffmpeg -i '" + file + "' -ss 00:00:00 -vframes 1 '" + imageFile + "'",
        (err, stdout, stderr) => {
          if (err) {
            // node couldn't execute the command
            console.log(err);
            return;
          }

          // the *entire* stdout and stderr (buffered)
          console.log(`stdout: ${stdout}`);
          console.log(`stderr: ${stderr}`);
          self.$forceUpdate();
        }
      );

      return imageFile;
    },
    importVideoFiles: function() {
      self = this;
      var openedFiles = dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"]
      });
      if (!openedFiles) return;

      async.each(
        openedFiles,
        function(file, callback) {
          ffprobe(file, { path: ffprobeStatic.path })
            .then(function(info) {
              const isFileImage = isImage(file);
              self.list.push({
                name: file,
                duration: isFileImage ? 2 : _.get(item, "streams[0].duration"),
                isImage: isFileImage,
                streams: info.streams
              });
              self.createVideoThumbnail(file);
              callback();
            })
            .catch(function(err) {
              console.error(err);
              callback();
            });
        },
        function(err) {
          // if any of the file processing produced an error, err would equal that error
          if (err) {
            // One of the iterations produced an error.
            // All processing will now stop.
            console.log("A file failed to process");
          } else {
            self.startCreatingVideo(true);
            self.$forceUpdate();
          }
        }
      );
    },
    getFormattedDuration: function(duration) {
      if (duration <= 0) return "0:00";

      const minutes = Math.floor(duration / 60);
      let seconds = parseInt(parseFloat(duration) - minutes * 60);
      seconds = seconds < 10 ? "0" + String(seconds).substr(-2) : String(seconds);

      return minutes + ":" + seconds;
    },
    shuffleVideos: function() {
      this.list = _.shuffle(this.list);
      self.startCreatingVideo(true);
    },
    removeVideo: function(index) {
      this.list.splice(index, 1);
      self.startCreatingVideo(true);
    },
    startCreatingVideo: function(isPreview) {
      isPreview = isPreview || false;
      const self = this;

      if (!isPreview) {
        this.isRendering = true;
      } else {
        this.isPreviewRendering = true;
      }

      try {
        fs.unlinkSync(path.join(app.getPath("downloads"), "final.mp4"));
      } catch (e) {
        console.error("Couldn't delete final.mp4");
      }

      try {
        fs.unlinkSync(path.join(app.getPath("downloads"), "finalwithaudio.mp4"));
      } catch (e) {
        console.error("Couldn't delete finalwithaudio.mp4");
      }

      try {
        fs.unlinkSync(path.join(app.getPath("downloads"), "videos.txt"));
      } catch (e) {
        console.error("Couldn't delete videos.txt");
      }

      async.parallel(
        [
          function(callback) {
            self.createListOfVideos();
            callback();
          },
          function(callback) {
            self.createOutputVideo(isPreview, callback);
          }
        ],
        function(err, results) {
          console.log("Video successfully created...");
          self.isRendering = false;
          self.isPreviewRendering = false;

          var video = document.getElementById("video");
          var source = document.getElementById("source");

          if (video) {
            video.pause();

            source.setAttribute("src", "file:///Users/michaelcalkins/Downloads/final.mp4");

            video.load();
            video.play();
          }
        }
      );
    },
    createOutputVideo: function(isPreview, cb) {
      console.log("Stitching together videos...");

      // audio volume in percentage https://trac.ffmpeg.org/wiki/AudioVolume

      const self = this;
      const videosTextFile = path.join(app.getPath("downloads"), "videos.txt");
      const finalVideoFile = path.join(app.getPath("downloads"), "final.mp4");
      const finalVideoFileWithAudio = path.join(app.getPath("downloads"), "finalwithaudio.mp4");
      const scalingCommand = isPreview ? "-vf scale=320:-1" : "";

      const createVideoCommand =
        __dirname +
        "/ffmpeg -f concat -safe 0 -i '" +
        videosTextFile +
        "' " +
        scalingCommand +
        " -c:a copy " +
        finalVideoFile;
      const addAudioCommand = this.audioFile
        ? __dirname +
          "/ffmpeg -i '" +
          finalVideoFile +
          "' -i '" +
          this.audioFile.name +
          "' " +
          scalingCommand +
          " " +
          " -c:v copy -c:a copy aac -strict experimental -t " +
          this.videoLength +
          " '" +
          finalVideoFile +
          "'"
        : "exit";

      exec(createVideoCommand + " && " + addAudioCommand, (err, stdout, stderr) => {
        self.isRendering = false;
        if (err) {
          // node couldn't execute the command
          console.log(err);
          return;
        }

        // the *entire* stdout and stderr (buffered)
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
        cb && cb();
      });
    },
    createListOfVideos: function(listOfVideos) {
      const videosTextFile = path.join(app.getPath("downloads"), "videos.txt");
      const finalVideoFile = path.join(app.getPath("downloads"), "final.mp4");
      this.list.forEach(function(file) {
        fs.appendFileSync(videosTextFile, "file '" + file.name + "'\n");

        if (file.isFileImage) {
          fs.appendFileSync(videosTextFile, "duration 3\n");
        }
      });
    }
  }
});
