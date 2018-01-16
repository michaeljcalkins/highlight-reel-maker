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
const touch = require("touch");

new Vue({
  el: "#app",
  data: {
    isRendering: false,
    list: [],
    audioFile: null
  },
  computed: {
    // a computed getter
    videoLength: function() {
      // `this` points to the vm instance
      return this.list
        .map(function(item) {
          return _.get(item, "streams[0].duration");
        })
        .reduce(function(total, num) {
          return total + Number(num);
        }, 0);
    }
  },
  methods: {
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
    importVideoFiles: function() {
      self = this;
      var openedFiles = dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"]
      });
      if (!openedFiles) return;

      openedFiles.forEach(function(file) {
        ffprobe(file, { path: ffprobeStatic.path })
          .then(function(info) {
            self.list.push({
              name: file,
              streams: info.streams
            });
          })
          .catch(function(err) {
            console.error(err);
          });
      });
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
    },
    removeVideo: function(index) {
      this.list.splice(index, 1);
    },
    startCreatingVideo: function() {
      const self = this;
      this.isRendering = true;

      try {
        fs.unlinkSync(path.join(app.getPath("downloads"), "final.mp4"));
      } catch (e) {}

      try {
        fs.unlinkSync(path.join(app.getPath("downloads"), "finalwithmusic.mp4"));
      } catch (e) {}

      try {
        fs.unlinkSync(path.join(app.getPath("downloads"), "videos.txt"));
      } catch (e) {}

      async.parallel(
        [
          function(callback) {
            self.createListOfVideos();
            callback();
          },
          function(callback) {
            self.createOutputVideo(callback);
          },
          function(callback) {
            self.addMusicToOutputVideo(callback);
          }
        ],
        function(err, results) {
          console.log("Video successfully created...");
          self.isRendering = false;
        }
      );
    },
    createOutputVideo: function(cb) {
      console.log("Stitching together videos...");

      const self = this;
      const videosTextFile = path.join(app.getPath("downloads"), "videos.txt");
      const finalVideoFile = path.join(app.getPath("downloads"), "final.mp4");

      exec(
        __dirname + "/ffmpeg -f concat -safe 0 -i " + videosTextFile + " -c:a copy " + finalVideoFile,
        (err, stdout, stderr) => {
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
        }
      );
    },
    createListOfVideos: function() {
      const videosTextFile = path.join(app.getPath("downloads"), "videos.txt");
      const finalVideoFile = path.join(app.getPath("downloads"), "final.mp4");

      this.list.forEach(function(file) {
        fs.appendFileSync(videosTextFile, "file '" + file.name + "'\n");
      });
    },
    addMusicToOutputVideo: function(cb) {
      console.log("Adding music...");
      const finalVideoFileWithAudio = path.join(app.getPath("downloads"), "finalwithaudio.mp4");
      const finalVideoFile = path.join(app.getPath("downloads"), "final.mp4");

      exec(
        __dirname +
          "/ffmpeg -i '" +
          finalVideoFile +
          "' -i '" +
          this.audioFile.name +
          "' -c:v copy -c:a aac -strict experimental -t 30 '" +
          finalVideoFileWithAudio +
          "'",
        (err, stdout, stderr) => {
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
        }
      );
    }
  }
});
