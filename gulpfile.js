/**
 * @Author: Guan Gui <guiguan>
 * @Date:   1970-01-01T10:00:00+10:00
 * @Email:  root@guiguan.net
 * @Last modified by:   guiguan
 * @Last modified time: 2018-01-25T13:42:07+11:00
 *
 * dbKoda - a modern, open source code editor, for MongoDB.
 * Copyright (C) 2017-2018 Southbank Software
 *
 * This file is part of dbKoda.
 *
 * dbKoda is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * dbKoda is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with dbKoda.  If not, see <http://www.gnu.org/licenses/>.
 */

const gulp = require('gulp');
const sh = require('shelljs');
const shell = require('gulp-shell');
const fs = require('fs');
const { argv } = require('yargs');
const through = require('through2');
const pump = require('pump');
const sequence = require('gulp-sequence');
const path = require('path');
const rename = require('gulp-rename');
const del = require('del');
const vinylPaths = require('vinyl-paths');

const GITHUB_BASE_URL = 'https://github.com/SouthbankSoftware';

/**
 * Update Submodules
 */
gulp.task(
  'updateSubmodules',
  shell.task('git submodule update --init --recursive --recommend-shallow --remote', {
    cwd: __dirname
  })
);

/**
 * Switch Submodule Branch
 *
 * -b: branch name
 * --depth: clone depth. Make sure the target branch is within the clone depth
 */
gulp.task('switchSubmoduleBranch', (cb) => {
  const branchName = argv.b;
  if (!branchName) {
    cb(new Error('Please specify a branch name using -b'));
  }
  const depth = argv.depth || false;
  process.chdir(__dirname);
  pump(
    [
      gulp.src(''),
      shell(['git submodule deinit --all -f', 'git rm -f --ignore-unmatch dbkoda*']),
      through.obj((file, _encoding, done) => {
        sh.rm('-rf', 'dbkoda*', '.git/modules/dbkoda*');
        done(null, file);
      }),
      shell([
        `git submodule add -b ${branchName} ${
          depth ? `--depth=${depth}` : ''
        } ${GITHUB_BASE_URL}/dbkoda-ui.git`,
        `git submodule add -b ${branchName} ${
          depth ? `--depth=${depth}` : ''
        } ${GITHUB_BASE_URL}/dbkoda-controller.git`,
        `git submodule add -b ${branchName} ${
          depth ? `--depth=${depth}` : ''
        } ${GITHUB_BASE_URL}/dbkoda.git`
      ])
    ],
    cb
  );
});

/**
 * Build dbKoda UI
 */
gulp.task('buildUi', (cb) => {
  process.chdir(path.resolve(__dirname, 'dbkoda-ui'));
  pump(
    [
      gulp.src(''),
      shell([
        'yarn install --no-progress',
        'node --max_old_space_size=2048 ./node_modules/webpack/bin/webpack.js --config webpack/prod.js'
      ])
    ],
    cb
  );
});

/**
 * Build dbKoda Controller
 */
gulp.task('buildController', (cb) => {
  process.chdir(path.resolve(__dirname, 'dbkoda-controller'));
  pump([gulp.src(''), shell(['yarn install --no-progress'])], cb);
});

/**
 * Build dbKoda App
 *
 * --release: whether to build a release version so that app is able to auto-update to latest
 *            version in release channel
 * --dev: whether to build a dev version so that app is able to auto-update to latest version in dev
 *            channel
 */
gulp.task('buildDbKoda', (cb) => {
  process.chdir(path.resolve(__dirname, 'dbkoda'));

  let buildCmd;

  if (argv.release) {
    buildCmd = 'yarn dist:release';
  } else if (argv.dev) {
    buildCmd = 'yarn dist:dev';
  } else {
    buildCmd = 'yarn dist';
  }

  pump(
    [
      gulp.src(''),
      shell([
        'yarn install --no-progress',
        'yarn dev:link',
        'mkdir -p dist/@southbanksoftware',
        buildCmd,
        'mv dist/@southbanksoftware/* dist',
        'rmdir dist/@southbanksoftware'
      ])
    ],
    cb
  );
});

/**
 * Add version (from Travis) suffix to build artifact
 */
gulp.task('addVersionSuffixToBuildArtifact', (cb) => {
  process.chdir(path.resolve(__dirname, 'dbkoda/dist'));

  const { TRAVIS, APPVEYOR } = process.env;

  let provider;
  let buildNum;

  if (TRAVIS === 'true') {
    const { TRAVIS_BUILD_NUMBER } = process.env;

    provider = 'travis';
    buildNum = TRAVIS_BUILD_NUMBER;
  } else if (APPVEYOR === 'true') {
    const { APPVEYOR_BUILD_NUMBER } = process.env;

    provider = 'appveyor';
    buildNum = APPVEYOR_BUILD_NUMBER;
  } else {
    return cb(new Error('Unknown CI provider'));
  }

  // retrieve branch info from `dbkoda` submodule
  const branch = fs
    .readFileSync(path.resolve(__dirname, '.gitmodules'))
    .toString()
    .match(/\[submodule "dbkoda"\][^\[\]]*branch = (\S+)/)[1];

  pump(
    [
      gulp.src(['*.AppImage', '*.yml', '*.sha1']),
      vinylPaths(del),
      rename((path) => {
        path.basename += `-${provider}.${buildNum}.${branch}`;
      }),
      gulp.dest('.')
    ],
    cb
  );
});

/**
 * Build all
 */
gulp.task('build', sequence('buildUi', 'buildController', 'buildDbKoda'));

/**
 * Default
 */
gulp.task('default', sequence('updateSubmodules', 'build'));
