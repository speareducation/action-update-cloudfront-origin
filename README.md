# Update CloudFront Origin javascript action
*Note: This action is designed to be compatible with Spear's static-sites configuration.*

This action updates the CloudFront Origin for the specified project given the following branches:
- releases/production/tag
- releases/staging/tag

...and the following distribution input:
```
{ 
    "staging":"E1234567890",
    "production": "E1234567890"
}
```

## Inputs

### `distributions`
**Required** A JSON object of the possible Distribution Ids

### `originId`
**Optional** A String signifying the Origin ID that is to be updated.
**Default** S3-spear-static-sites

## Example usage
```
- uses: speareducation/action-update-cloudfront-origin@master
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  with:
    distributions: |
    { 
      "staging":"E1234567890",
      "production": "E1234567890",
      "dotco": "E1234567890"
    }