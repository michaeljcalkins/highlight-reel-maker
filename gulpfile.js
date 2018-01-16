var gulp = require('gulp'),
  run = require('gulp-run'),
  rename = require('gulp-rename'),
  watch = require('gulp-watch'),
  sass = require('gulp-ruby-sass'),
  autoprefixer = require('gulp-autoprefixer'),
  rename = require('gulp-rename'),
  concat = require('gulp-concat'),
  notify = require('gulp-notify'),
  cache = require('gulp-cache')

gulp.task('styles', function() {
  return sass('resources/sass/app.scss', { style: 'expanded' }).pipe(gulp.dest('src/css'))
})

gulp.task('watch', ['styles'], function(cb) {
  watch('resources/sass/**/*.scss', function() {
    gulp.run('styles')
  })
})

gulp.task('default', ['styles'])
