(function() {
  'use strict';

  var nano = require('nano')({
    url: 'http://nmsdb.nunavuthousing.ca:5984'
  })
  var jimp = require('jimp')
  var dataUriToBuffer = require('data-uri-to-buffer');
  var async = require('async')
  var ipfsAPI = require('ipfs-api');
  var DB = nano.use("cape_dorset_hip");


  // start IPFS system
  var ipfs = ipfsAPI('localhost', '5001', {
    protocol: 'http'
  })



  // listen for changes feeds in cape dorset for testing
  var changes = DB.follow({})

  changes.filter = function(doc, req) {
    return doc.doctype == 'inspection' && !doc.imageProcessed; //&& doc.completed
  }

  changes.on('change', function(doc) {
    //console.log("inspection found completed but not processed:", doc)
    // process the document
    ProcessInspection(doc.doc)

  })

  changes.on('error', function(error) {
    console.log("error: ", error)
  })

  changes.follow();




  // functions

  function ProcessInspection(inspection) {

    console.log("searching for images in the schema", inspection._id);

    if (inspection && inspection.schema && inspection.schema.group && inspection.schema.group.groups) {
      //console.log(inspection.schema.group.groups)
      var locations = inspection.schema.group.groups
      var newImages = [];

          async.eachOf(locations,function(location,locid,cb1) {
            console.log(locid);
            async.eachOf(location.components,function(component,compid,cb2) {
              console.log(compid);
              if (component.images) {
                console.log(component.images.length + " images found")

                // process images
                var images = component.images

                var newImagesArray = []

                async.each(images, function(img, cb3) {
                  if (img.length > 50) jimp.read(dataUriToBuffer(img), function(err, image) {
                    console.log(err)
                    image.quality(50)
                    image.contain(196, 196)
                    image.getBuffer(jimp.MIME_JPEG, function(err, buffer) {
                      // console.log("uri", err, buffer)
                      ipfs.add(dataUriToBuffer(img), function(err, res) {
                        console.log("added: ", res[0].hash);
                        newImagesArray.push(res[0].hash);
                        newImages.push({
                          name: res[0].hash,
                          data: buffer,
                          content_type: 'image/jpeg'
                        })
                        cb3();
                      })
                    })

                  })
                  else {
                    newImagesArray.push(img)
                    cb3();
                  }

                }, function(err) {
                  console.log("async err:", err)
                  // update doc

                  component.images = newImagesArray;
                  cb2()
                })


              } else {
                cb2()
              }

            },function(err){
              if (err) console.log(err)
              console.log("doc update attachments", newImages);
              cb1()
            })


          },function(err){
            if (err) console.log(err)

            console.log("new images", newImages);
            inspection.imageProcessed = true;
            DB.multipart.insert(inspection, newImages, inspection._id, function(err, body) {
              console.log("updated:", err, body);

            })
          })


    }
  }





})();
