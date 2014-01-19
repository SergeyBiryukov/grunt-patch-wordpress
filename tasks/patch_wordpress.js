/*
 * grunt-patch-wordpress
 * https://github.com/aaronjorbin/grunt-patch-wordpress
 * Based on https://gist.github.com/markjaquith/4219135 
 *
 *
 * Copyright (c) 2013 Aaron Jorbin
 * Licensed under the MIT license.
 */

var request = require('request')
    , exec =  require('child_process').exec
    , inquirer = require("inquirer")
    , url = require('url')
    , fs = require('fs')
	, _ = require('underscore')

_.str = _.str = require('underscore.string')
_.mixin( _.str.exports() )
    

module.exports = function(grunt) {
    var temp_file = 'wppatch.diff'
		, defaults = {
			tracUrl : 'core.trac.wordpress.org'
		}
	

    function is_svn(){
        return fs.existsSync('.svn')
    }

    function apply_patch( patch_url , done , options ){
        grunt.verbose.write( patch_url )
        parsed_url = url.parse( patch_url )

        // What to do when either our patch is ready
        grunt.event.once('fileReady', function(level){
               exec('patch -p' + level + ' < '  + temp_file, function(error, result, code) {
                    grunt.log.debug( 'level: '  + level  )
					grunt.log.debug( 'error: '  + error  )
					grunt.log.debug( 'result: ' + result )
					grunt.log.debug( 'code: '   + code )

					if ( error ) {
						grunt.log.errorlns( result )
						done( 1 )
					} else {
						grunt.file.delete(temp_file)
						done(0)
					}
                }) 
		})

        // or we know we have failed
        grunt.event.once('fileFail', function(msg){
            if (typeof msg === 'string') {
                grunt.log.errorlns(msg)
			}

            done(false)
        })


        // if patch_url is a full url and is a raw-attachement, just apply it 
        if( parsed_url.hostname === options.tracUrl && parsed_url.pathname.match(/raw-attachment/) ) {
            get_patch( patch_url, options )
        // if patch_url is full url and is an attachment, convert it to a raw attachment
		} else if ( parsed_url.hostname === options.tracUrl && parsed_url.pathname.match(/attachment/) && parsed_url.pathname.match(/(patch|diff)/ ) ) {
            get_patch( convert_to_raw ( parsed_url, options ) )
        // if patch_url is just a ticket number, get a list of patches on that ticket and allow user to choose one
        } else if (  parsed_url.hostname === options.tracUrl && parsed_url.pathname.match(/ticket/) ) { 
            get_patch_from_ticket( patch_url, options )
        // if we just enter a number, assume it is a ticket number
        } else if ( parsed_url.hostname === null && ! parsed_url.pathname.match(/\./) ) {
            get_patch_from_ticket_number( patch_url, options )
        // if patch_url is a local file, just use that 
        } else if ( parsed_url.hostname === null ) {
            get_local_patch( patch_url, options )
        // We've failed in our mission
        } else {
            grunt.event.emit('fileFile', 'All matching failed.  Please enter a ticket url, ticket number, patch url')
		}
    }

    function convert_to_raw( parsed_url, options ){
		grunt.log.debug( 'convert_to_raw: ' + JSON.stringify(parsed_url ) )	
        parsed_url.pathname = parsed_url.pathname.replace(/attachment/, "raw-attachment")
		grunt.log.debug( 'converted_from_raw: ' + url.format( parsed_url ) )
        return url.format( parsed_url )
    }

    function get_patch_from_ticket_number( patch_url, options  ){
		grunt.log.debug( 'get_patch_from_ticket_number: ' + patch_url )	
		get_patch_from_ticket( 'https://' + options.tracUrl + '/attachment/ticket/' + patch_url + '/', options  )
    }

    function get_patch_from_ticket( patch_url, options ){
		var matches
			, match_url

		grunt.log.debug( 'get_patch_from_ticket: ' + patch_url )	
		request( patch_url, function(error, response, body) {
            if ( !error && response.statusCode == 200 ) {
				matches = body.match( /<dt>\s*<a\s+href="([^"]+)"\s+title="View attachment">([^<]+)/g )
				if (matches == null) {
                    grunt.event.emit('fileFail', patch_url + '\ncontains no attachments')
				} else if (matches.length = 1){
					match_url = options.tracUrl + /href="([^"]+)"/.exec( matches[0] )[0].replace('href="', '').replace('"', '') 
					get_patch( convert_to_raw ( url.parse( 'https://' + match_url  ) ), options  )
				}

				grunt.log.debug( 'matches: ' + JSON.stringify( matches ) )
            } else {
                // something went wrong
                    grunt.event.emit('fileFail', 'get_patch_from_ticket fail \n status: ' + response.statusCode )
            }
		})

		// find out how many patches are on the ticket

		// if one, get it and apply it 

		// if more than one, give some options


		grunt.event.emit('fileFile', 'method not available yet')
    }

    function get_local_patch(patch_url) {
        var body = grunt.file.read(patch_url)
            , level = level_calculator( body )

        grunt.file.copy(patch_url, temp_file)
        grunt.event.emit('fileReady', level)
    }

	function level_calculator( diff ){
		var level = 0
		try {
			diff = diff.split( '\n' )
			_.each( diff, function( line ) {
				if ( _.startsWith( line, 'diff --git a/' ) ) {
					throw 1
				}
				if ( _.startsWith( line, 'Index: src/' ) ) {
					throw 1
				}
				if ( _.startsWith( line, '+++ src/' ) ) {
					throw 1
				}

			})
			throw 0
		} catch( l ) {
			level = l	
		}

		return level
	}

    function get_patch( patch_url ){
		grunt.log.debug( 'getting patch: ' + patch_url )
        request(patch_url, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                var level = level_calculator( body )

                grunt.file.write( temp_file, body)
                grunt.event.emit('fileReady', level)
            } else {
                // something went wrong
                    grunt.event.emit('fileFail', 'get_patch_fail \n status: ' + response.statusCode )
            }
        })
    }

    function file_fail( done, msg ) {
		grunt.log.errorlns( 'Nothing to patch.' )
		grunt.log.errorlns( 'To use this command, please:' )
		grunt.log.errorlns( '1) have a diff or patch in your WordPress Directory' )
		grunt.log.errorlns( '2) enter a ticket number ala grunt patch:15705' )
		grunt.log.errorlns( '3) enter a ticket url ala grunt patch:https://core.trac.wordpress.org/ticket/15705' )
		grunt.log.errorlns( '4) enter a patch url ala grunt patch:https://core.trac.wordpress.org/attachment/ticket/26870/26870-media-views.diff' )

		if ( typeof( msg ) === 'string' ) {
			grunt.verbose.errorlns( 'msg: ' + msg )
		}

        done( false )
    }

	function local_file( error, result, code, done, options ) {
		if ( ! error ){
			files = _.filter( result.split( "\n" ) , function( file ) {
				return ( _.str.include( file, 'patch' ) || _.str.include( file, 'diff') ) 
			})

			if ( files.length === 0 ) {
				file_fail( done )
			} else if ( files.length === 1 ) {
				apply_patch( files[0] , done, options )
			} else {
				inquirer.prompt([
					{	type: 'list',
						name: 'file',
						message: 'Please select a file to apply',
						choices: files
					}
				], function ( answers ) {
					var file = answers.file.replace( '?', '' ).replace( /\s/g, '' )
					apply_patch( file , done, options )
				})
			}
		} else {
			file_fail( done , 'local file fail' )
		}
	}


    grunt.registerTask( 'patch', 'Patch your develop-wordpress directory like a boss', function( ticket, afterProtocal ) {
        var done = this.async()
		var options = this.options(defaults)

        // since URLs contain a : which is the seperator for grunt, we 
		// need to reassemble the url.
        if (typeof afterProtocal !== 'undefined') {
            ticket = ticket + ':' + afterProtocal
		}

        grunt.log.debug( 'ticket: ' + ticket )
		grunt.log.debug( 'options: ' + JSON.stringify( options ) )

        if (typeof ticket === 'undefined'){
            // look for diffs and patches in the root of the checkout and 
			// prompt using inquirer to pick one 

            var fileFinderCommand = is_svn() ? "svn status " : 'git ls-files --other --exclude-standard'
                , files

            exec(fileFinderCommand , function(error, result, code) {
				local_file( error, result, code, done, options)
            })
        } else {
            apply_patch( ticket , done, options )

        }

    })

}
