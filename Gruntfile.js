/*
 * grunt-edools-deploy
 *
 *
 * Copyright (c) 2014 Diogo Beda
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {
  // load all npm grunt tasks
  require('load-grunt-tasks')(grunt);

  // Project configuration.
  grunt.initConfig({
    jshint: {
      all: [
        'Gruntfile.js',
        'tasks/*.js',
        '<%= nodeunit.tests %>'
      ],
      options: {
        jshintrc: '.jshintrc',
        reporter: require('jshint-stylish')
      }
    },

    // Before generating any new files, remove any previously-created files.
    clean: {
      tests: ['tmp']
    },

    // Configuration to be run (and then tested).
    edools_deploy: {
      default_options: {
        options: {
          domain: 'demo',
          theme: '53ab222e72616969ed000000',
          token: 'b40bbce82ef79ea6be0fb3294e7d948c:b712a32e4fb59e141e935da4c79ebce1',
          zipTo: 'test/fixtures/public'
        },
        files: [
          {expand: true, cwd: 'test/fixtures/dist/' ,src: ['**']}
        ]
      }
    },

    // Unit tests.
    nodeunit: {
      tests: ['test/*_test.js']
    }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['clean', 'edools_deploy', 'nodeunit']);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'test']);

};
