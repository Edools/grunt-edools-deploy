
/*
 * grunt-edools-deploy
 *
 *
 * Copyright (c) 2014 Diogo Beda
 * Licensed under the MIT license.
 */

'use strict';
var https = require('https'),
  FormData = require('form-data'),
  Q = require('q'),
  fs = require('fs'),
  ThemeHandler = require('@edools/epm').ThemeHandler,
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

  grunt.registerMultiTask('edools_deploy', 'Deploys a theme for your Edools School', function () {
    var options = this.options({
      zipFile: 'dist.zip'
    });

    var emitter = new EventEmitter(),
      done = this.async(),
      files = [];

    grunt.log.writeln('Getting S3 credentials...');

    var onPresignedSuccess = function (res) {
      var result = '';
      res.on('data', function (chunk) {
        result += chunk;
      });

      res.on('end', function () {
        try {
          var presigned = JSON.parse(result);
          emitter.emit('presigned_post', presigned);
        } catch (e) {
          console.error(result);
          grunt.fail.warn(e);
        }
      });
    };

    https.get({
      host: config.presigned_post.host,
      path: config.presigned_post.path.replace(':id', options.theme),
      headers: {
        Authorization: 'Token token='+options.token
      }
    }, onPresignedSuccess);

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
      form.append('file', fs.createReadStream(options.package_file));

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
            id: options.theme,
            dependencies: options.apps,
            token: options.token,
            package_url: result.PostResponse.Location[0]
          };

          ThemeHandler.deploy(data)
            .then(onDeploySuccess)
            .catch(onDeployError);
        });

      var onDeployError = function (err) {
        console.log(err.entity);
        grunt.log.error(JSON.stringify(err));
      };

      var onDeploySuccess = function (res) {
        grunt.log.ok();
        emitter.emit('task_done');
      };
    });

    emitter.on('task_done', done);
  });

};
