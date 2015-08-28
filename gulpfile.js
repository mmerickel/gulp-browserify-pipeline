'use strict';
var
  browserify = require('browserify'),
  buffer = require('vinyl-buffer'),
  eslint = require('gulp-eslint'),
  gulp = require('gulp'),
  gutil = require('gulp-util'),
  merge = require('merge-stream'),
  source = require('vinyl-source-stream');

var src_root = './webassets';
var dist_root = './static';

var paths = {
  src_root: src_root,
  dist_root: dist_root,
  src: {
    scripts: src_root + '/scripts',
  },
  dist: {
    js: dist_root + '/js',
  },
};

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

var config = {
  paths: paths,
  browserify: {
    bundles: {
      'common': {
        src: paths.src.scripts + '/common.js',
        expose: [
          'jquery',
        ],
      },
      'app': {
        src: paths.src.scripts + '/app.js',
        depends: ['common'],
      },
    },
    dest: paths.dist.js,
  },
};

gulp.task('eslint', function() {
  return gulp.src(paths.src.scripts + '/**/*.js')
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failOnError());
});

function orderByDeps(bundles) {
  var bundleOrder = [];
  var bundleKeys = Object.keys(bundles);

  // topologically sort bundles into bundlers
  var prevLength = bundleKeys.length;
  while(bundleKeys.length > 0) {
    for (var keyIndex in bundleKeys) {
      var bundleKey = bundleKeys[keyIndex];
      var bundleConfig = bundles[bundleKey];
      var depsSatisfied = (bundleConfig.depends || []).reduce(function (prevVal, dep) {
        return prevVal && bundleOrder.indexOf(dep) > -1;
      }, true);
      if (depsSatisfied) {
        bundleOrder.push(bundleKey);
        bundleKeys.splice(keyIndex, 1)
        break;
      }
    }
    if (bundleKeys.length == prevLength) {
      throw new Error(
        'unsatisfied dependencies in browserify bundles: ' +
        bundleKeys);
    }
    prevLength = bundleKeys.length;
  }
  return bundleOrder;
}

gulp.task('browserify', ['eslint'], function() {
  var c = config.browserify;
  var runtime = {};

  orderByDeps(c.bundles).forEach(function(bundleKey) {
    var bundleConfig = c.bundles[bundleKey];
    var bundler = bundleThis(bundleConfig);
    runtime[bundleKey] = {
      bundler: bundler,
      streamBuilder: buildThis.bind(this, bundler, bundleConfig, bundleKey + '.js'),
    };
  });

  function buildThis(bundler, bundleConfig, outputName) {
    return bundler
      .bundle()
      .on('error', function(err) {
        gutil.log(gutil.colors.red('Error'), err.message);
        this.emit('end');
      })
      .pipe(source(outputName))
      .pipe(buffer())
      .pipe(gulp.dest(c.dest));
  }

  function bundleThis(bundleConfig) {
    var bundler = browserify({
      entries: bundleConfig.src,
      debug: true,
      noParse: c.noParse,
    });
    return bundler;
  }

  return merge(Object.keys(runtime).map(function (bundleKey) {
    return runtime[bundleKey].streamBuilder();
  }));
});

gulp.task('build', ['browserify']);

gulp.task('default', ['build']);
