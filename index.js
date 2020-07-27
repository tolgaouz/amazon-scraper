const { addExtra } = require('puppeteer-extra')
const chromium = require('chrome-aws-lambda');
const AWS = require('aws-sdk');
var fs = require('fs');

//  Uncomment the line below to use .env file with the setup,

//  require('dotenv').config()

//  you can set ENV VARs from Lambda Dashboard as well.

exports.handler = async (event) => {

  // Simple function to wait time miliseconds
  const wait = (time)=>{
    return new Promise((res,rej)=>{
      setTimeout(()=>{
        res(true)
        console.log('Waited',time,'ms')
      },time)
    })
  }

  //  Function to change postal code to 75035 -- This might not work with headless browser
  //  try setting a different user agent. --

  const changePostalCode = (info)=>{
    //
    //  Info here is passed only to keep track of the query this function
    //  executing at the moment.
    //
    
    return new Promise(async(res,rej)=>{
      try{
        await page.evaluate(async ()=>{
          await fetch("https://www.amazon.com/gp/delivery/ajax/address-change.html", {
            "headers": {
              "accept": "text/html,*/*",
              "accept-language": "tr-TR,tr;q=0.9,en-GB;q=0.8,en;q=0.7,en-US;q=0.6",
              "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
              "downlink": "10",
              "ect": "4g",
              "rtt": "100",
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-origin",
              "x-requested-with": "XMLHttpRequest"
            },
            "referrer": "https://www.amazon.com/",
            "referrerPolicy": "no-referrer-when-downgrade",
            "body": "locationType=LOCATION_INPUT&zipCode=75035&storeContext=generic&deviceType=web&pageType=Gateway&actionSource=glow&almBrandId=undefined",
            "method": "POST",
            "mode": "cors",
            "credentials": "include"
          });
        });
        return res(true)
      }catch(err){
        console.log(info+'Failed while changing address')
        return rej(err)
      }
    });
  }

  //  Navigator function with tries.
  const navigateWithError = (page,url,info)=>{
    return new Promise(async (res,rej)=>{
      let maxTries = 3
      let i = 0
      while(i<maxTries){
        try{
          await page.goto(url);
          return res(true)
        }catch(err){
          console.log(err)
          console.error(info+'Couldnt navigate, trying again')
          i+=1
        }
      }
      return rej('Couldnt navigate after tries, passing.')
    })
  }

  const puppeteerExtra = addExtra(chromium.puppeteer)

  // AWS Credentials
  const ID = process.env.AWS_ID
  const SECRET = process.env.AWS_SECRET
  const BUCKET_NAME = process.env.AWS_BUCKET_NAME

  // Initialize S3 Object
  const s3 = new AWS.S3({
    accessKeyId: ID,
    secretAccessKey: SECRET
  });

  //  Take screenshot function, takes in browser and query as variables,
  //  Changes the postal code on each call, creates an individual page, operates, then closes
  //  This function will be called simultenously within a chunk of pages.

  //  time variable is passed to keep one time instance through the whole process
  const takeScreenShot = (browser,query,time)=>{
    let info = 'Query-->'+query+' : '
    if(query.split(' ').length>1)
    {
      query = query.split(' ').join('+')
    }
    //  Return a Promise so we can wait for all simultenous Promises to resolve, thus
    //  abling us to use them parallelized.
    return new Promise(async (res,rej)=>{
      try{

        const page = await browser.newPage();
        console.log(info+'created new page')

        await page.setViewport({
          width: 1366,
          height: 768,
        })

        await navigateWithError(page,'https://www.amazon.com/',info)
        console.log(info+'Navigated to amazon')

        await changePostalCode(info)
        console.log(info+'changed postal code')

        await navigateWithError(page,'https://www.amazon.com/s?k='+query+'&ref=nb_sb_noss_2',info)
        console.log(info+'inserted query')

        await page.screenshot({
          path:'/tmp/'+query+'.png',
          type:'png'
        })
        console.log(info+'took screenshot')

        await page.close()
        console.log(info+'closed page')

        await uploadFile(query+'.png',time,info)
        deleteFile(query+'.png')

        return res(true)

      }catch(err){

        console.error(info+err)

        // ** Pretty stupid way, but it works ** 
        //  Resolve with true anyway so main loop doesn't get interrupted.

        return res(true)

      }
    })
  }

  //  Helper function to download file from S3
  const s3download = function (params) {
    return new Promise((resolve, reject) => {
      s3.createBucket({
        Bucket: BUCKET_NAME 
      }, function () {
          s3.getObject(params, function (err, data) {
            if (err) {
              reject(err);
            } else {
              console.log(data)
              console.log("Successfully dowloaded data from  bucket");
              resolve(JSON.parse(data.Body));
            }
          });
      });
    });
  }

  //  A helper function to upload file to the bucket inside screenshots directory.
  const uploadFile = (fileName,clock,info) => {
    return new Promise((res,reject)=>{
      let time = clock.toLocaleTimeString()
      let date = clock.toISOString().split('T')[0].replace('/-/g','/')
      // Read content from the file
      const fileContent = fs.readFileSync('/tmp/'+fileName);
      let filePath = date+'/'+time+'/'+fileName

      // Setting up S3 upload parameters
      const params = {
          Bucket: BUCKET_NAME,
          Key: filePath, // File name you want to save as in S3
          Body: fileContent
      };

      // Uploading files to the bucket
      s3.upload(params, function(err, data) {
          if (err) {
            reject(err);
          }
          console.log(info+`File uploaded successfully. ${data.Location}`);
          res(data)
      });
    })
  };

  //  An helper function to delete a file inside screenshots directory.
  const deleteFile = (fileName) =>{
    fs.unlink('/tmp/'+fileName, function (err) {
      if (err) throw err;
      // if no error, file has been deleted successfully
      console.log('File deleted!');
    });
  } 

  // An helper function to split an array into chunks with the given length
  const chunk = function(list, chunkSize) {
    // Error checks
    if (!list.length) {
      return [];
    }
    if (typeof chunkSize === undefined) {
      chunkSize = 10;
    }

    // Split process
    var i, j, t, chunks = [];
    for (i = 0, j = list.length; i < j; i += chunkSize) {
      t = list.slice(i, i + chunkSize);
      chunks.push(t);
    }

    return chunks;
  };
  

  // Add stealth plugin and use defaults (all tricks to hide puppeteer usage)
  const StealthPlugin = require('puppeteer-extra-plugin-stealth')

  // Use Stealth Plugin
  puppeteerExtra.use(StealthPlugin())

  //  Main Loop
  //  Initialize the main browser object.
  const browser = await puppeteerExtra
    .launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless
    })
  
  console.log('initialized browser')
  var params = {Bucket: BUCKET_NAME, Key: 'queries/queries.json'};
  let queries = await s3download(params)
  console.log('downloaded file')

  //  Split the queries into chunks, we want to use a for loop to digest chunks one by one
  const splitted_queries = chunk(queries.data,3)

  const uploading_time = new Date()

  for(var i=0;i<splitted_queries.length;i++){

    queries = splitted_queries[i]
    console.log('Batch number', i+1, 'is being executed right now.')

    let promises = queries.map(async (query,idx)=>{
      return takeScreenShot(browser,query,uploading_time)
    })

    await Promise.all(promises)
    await wait(2000)

  }

  await browser.close();
    
};