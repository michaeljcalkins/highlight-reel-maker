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
const draggable = require("vuedraggable");
const Vue = require("vue/dist/vue.min.js");

new Vue({
  el: "#app",
  components: {
    draggable
  },
  data: {
    activeView: "videos",
    activeElement: null,
    isRendering: false,
    list: [],
    videoNameInput: "",
    audioFile: null
  },
  beforeCreate: function() {
    try {
      fs.mkdirSync(path.join(app.getPath("temp"), "com.michaeljcalkins.awesome-ad-creator"));
    } catch (e) {}
  },
  computed: {
    filePath: function() {
      return path.join(app.getPath("temp"), "com.michaeljcalkins.awesome-ad-creator");
    },
    videoName: function() {
      return this.videoNameInput || "Untitled";
    },
    videoSrc: function() {
      const videoFile = path.join(this.filePath, this.videoName + ".mp4");
      return "file://" + videoFile;
    },
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
    setActiveElement: function(element) {
      this.activeElement = _.cloneDeep(element);
    },
    copyActiveElementToElementList: function() {
      const activeIndex = _.findIndex(this.list, { id: this.activeElement.id });
      this.list.splice(activeIndex, 1, this.activeElement);
      this.setActiveElement(null);
    },
    getImageThumbnail(file) {
      return path.join(this.filePath, sanitize(file) + ".png");
    },
    createVideoThumbnail: function(file, cb) {
      let self = this;
      console.log("Creating video thumbnail for " + file);
      const imageFile = path.join(this.filePath, sanitize(file) + ".png");
      exec(
        __dirname + "/ffmpeg -i '" + file + "' -ss 00:00:00 -vframes 1 '" + imageFile + "'",
        (err, stdout, stderr) => {
          if (err) {
            // node couldn't execute the command
            console.log(err);
            cb && cb();
            return;
          }

          // the *entire* stdout and stderr (buffered)
          console.log(`stdout: ${stdout}`);
          console.log(`stderr: ${stderr}`);
          self.$forceUpdate();
          cb && cb();
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

      console.log("Importing videos...");

      async.each(
        openedFiles,
        function(file, callback) {
          ffprobe(file, { path: ffprobeStatic.path })
            .then(function(info) {
              const isFileImage = isImage(file);
              self.list.push({
                id: _.uniqueId(),
                name: file,
                duration: isFileImage ? 2 : _.get(info, "streams[0].duration"),
                isImage: isFileImage,
                streams: info.streams
              });
              self.createVideoThumbnail(file, callback);
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
            console.log("Video thumbnails created...");
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
    },
    removeVideo: function(id) {
      const newList = this.list.filter(function(element) {
        return element.id !== id;
      });
      this.list = newList;
      this.setActiveElement(null);
    },
    startCreatingVideo: function() {
      const self = this;

      if (this.list.length === 0) return;

      this.isRendering = true;

      console.log("Deleting old files...");

      try {
        fs.unlinkSync(path.join(app.getPath("downloads"), this.videoName + ".mp4"));
      } catch (e) {}

      try {
        fs.unlinkSync(path.join(this.filePath, "videos.txt"));
      } catch (e) {}

      async.series(
        [
          function(callback) {
            self.createListOfVideos();
            callback();
          },
          function(callback) {
            self.createOutputVideo(callback);
          }
        ],
        function(err, results) {
          console.log("Video successfully created...");

          self.isRendering = false;

          var video = document.getElementById("video");
          var source = document.getElementById("source");

          if (video) {
            video.pause();

            source.setAttribute("src", this.currentVideoName);

            video.load();
            video.play();
          }
        }
      );
    },
    createOutputVideo: function(cb) {
      console.log("Starting to create output video...");

      const self = this;
      const videosTextFile = path.join(this.filePath, "videos.txt");
      const finalVideoFile = path.join(app.getPath("downloads"), this.videoName + ".mp4");

      const createVideoCommand =
        __dirname + "/ffmpeg -f concat -safe 0 -i '" + videosTextFile + "' -c:a copy '" + finalVideoFile + "'";

      console.log("Executing rendering function...");

      exec(createVideoCommand, (err, stdout, stderr) => {
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
      console.log("Create list of files...");

      const videosTextFile = path.join(this.filePath, "videos.txt");
      this.list.forEach(function(file) {
        fs.appendFileSync(videosTextFile, "file '" + file.name + "'\n");

        if (file.isImage) {
          fs.appendFileSync(videosTextFile, "duration " + file.duration + "\n");
        }
      });
    }
  }
});
