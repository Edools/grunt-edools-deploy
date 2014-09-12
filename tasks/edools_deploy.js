/*
 * grunt-edools-deploy
 *
 *
 * Copyright (c) 2014 Diogo Beda
 * Licensed under the MIT license.
 */

'use strict';
var https = require('https'),
  EasyZip = require('easy-zip').EasyZip,
  FormData = require('form-data'),
  Q = require('q'),
  fs = require('fs'),
  parseString = Q.denodeify(require('xml2js').parseString),
  EventEmitter = new require('events').EventEmitter;


module.exports = function (grunt) {

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks
  var config = {
    presigned_post: {
      host: 'api.myedools.com',
      path: '/themes/:id/s3_presigned_post'
    },
    deploy: {
      host: 'www.myedools.com',
      path: '/themes/deploy'
    }
  };

  var httpsQ = function (opts) {
    var deferred = Q.defer();
    https.request(opts, deferred.resolve).on('error', deferred.reject);
    return deferred.promise;
  };


  grunt.registerMultiTask('edools_deploy', 'Deploys a theme for your Edools School', function () {
    var options = this.options({
      zipFile: 'dist.zip'
    });

    var zip = new EasyZip(),
      emitter = new EventEmitter(),
      done = this.async(),
      files = [];

    // check if files exist and push to array that'll be zipped
    this.files.forEach(function (file) {
      file.src
        .filter(function (path) {
          return grunt.file.exists(path);
        })
        .map(function (path) {
          var zipObj = { source: path, target: file.dest };

          if(path.indexOf('.') === -1) {
            delete zipObj.source;
          }

          files.push(zipObj);
        });
    });

    // batch zip theme files
    grunt.log.writeln('Compressing theme files...')
    zip.batchAdd(files, function () {
      if(!grunt.file.exists(options.zipTo)) {
        grunt.file.mkdir(options.zipTo);
      }

      zip.writeToFileSycn(options.zipTo + '/' + options.zipFile);
      emitter.emit('zipped');
    });

    // whem zipped, get s3 presigned post keys
    emitter.on('zipped', function () {
      grunt.log.ok();
      grunt.log.writeln('Getting S3 credentials...');

      var onPresignedSuccess = function (res) {
        var result = '';
        res.on('data', function (chunk) {
          result += chunk;
        });

        res.on('end', function () {
          emitter.emit('presigned_post', JSON.parse(result));
        });
      };

      https.get({
        host: config.presigned_post.host,
        path: config.presigned_post.path.replace(':id', options.theme),
        headers: {
          Authorization: 'Token token='+options.token
        }
      }, onPresignedSuccess);
    });

    // when presigned post is ready, upload to s3
    emitter.on('presigned_post', function (result) {
      grunt.log.ok();
      grunt.log.writeln('Uploading theme...');

      var form = new FormData();

      // append options to form data
      form.append('Content-Type', 'application/zip');
      form.append('key', result.fields.key);
      form.append('AWSAccessKeyId', result.fields.AWSAccessKeyId);
      form.append('policy', result.fields.policy);
      form.append('signature', result.fields.signature);
      form.append('success_action_status', result.fields.success_action_status);
      form.append('acl', result.fields.acl);
      form.append('file', fs.createReadStream(options.zipTo + '/' + options.zipFile));

      var onUploadSuccess = function (res) {
        var response = '';
        res.on('data', function (chunk) {
          response += chunk;
        });

        res.on('end', function () {
          emitter.emit('uploaded', response);
        });
      };

      form.submit(result.url, function (err, res) {
        if(err) grunt.log.error(err);
        if(res.statusCode.toString() === result.fields.success_action_status) {
          onUploadSuccess(res);
        }
      });
    });

    emitter.on('uploaded', function (response) {
      grunt.log.ok();
      grunt.log.writeln('Deploying...');

      parseString(response)
        .then(function (result) {
          var data = {
              school: options.domain,
              theme: options.theme,
              package_url: result.PostResponse.Location[0]
            };

          var req = https.request({
            method: 'POST',
            host: config.deploy.host,
            path: config.deploy.path,
            auth: 'themeDeploy:themeDeploy123',
            headers: {
              'Content-Type': 'application/json'
            }
          }, onDeploySuccess);
          req.write(JSON.stringify(data));
          req.on('error', onDeployError);
          req.end();
        });

      var onDeployError = function (err) {
        grunt.log.error(err);
      };

      var onDeploySuccess = function (res) {
        if(res.statusCode === 200) {
          grunt.log.ok();
        }

        emitter.emit('task_done');
      };
    });

    emitter.on('task_done', done);
  });

};
