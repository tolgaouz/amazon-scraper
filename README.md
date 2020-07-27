# Amazon Scraper hosted on AWS Lambda

# How it works 

This project uses puppeteer to scrape amazon using 5 concurrent tabs for given queries. Returns a screenshot of the results page and uploads it to an S3 Bucket.

# How to use

- Clone the repo `` git clone https://github.com/tolgaouz/amazon-scraper ``

- Set your .env keys:

```
   AWS_SECRET = XXXXXXXXX
   AWS_ID = XXXXXXXX
   AWS_BUCKET = XXXXXXXX
```

- Create a Lambda function your AWS Console

- Zip the file, and upload it to your lambda function.
