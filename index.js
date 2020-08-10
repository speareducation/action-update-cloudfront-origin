const AWS = require('aws-sdk');
const core = require('@actions/core');
const github = require('@actions/github');
const cloudfront = new AWS.CloudFront();

const handle = async () => {
    const distributions = JSON.parse(core.getInput('distributions'));
    const originId = core.getInput('originId');
    const project = github.context.repo.repo || null;
    const branch = github.context.ref.replace('refs/heads/', '')
    const environment = branch.split('/')[1] || null;

    if (!distributions[environment]) {
        console.log(`Exiting. No Distribution ID defined for '${environment}'`)
        return;
    }

    // get old configuration
    console.log('Fetching old Distribution')
    const result = await cloudfront.getDistributionConfig({ Id: distributions[environment] }).promise();
    const { ETag, DistributionConfig } = result
    
    // upload configuration with new OriginPath
    // For help with this, see ./example-cloudfront-config.json
    // or use aws-spear cloudfront get-distribution-config --id= "<DIST ID>" | tee
    console.log('Updating Distribution');
    console.log({ originId, project, branch })
    const originIndex = DistributionConfig.Origins.Items.findIndex(item => item.Id === originId);
    if (originIndex !== -1) {
        console.log('Old Origin Path', DistributionConfig.Origins.Items[originIndex].OriginPath);
        DistributionConfig.Origins.Items[originIndex].OriginPath = `/${project}/${branch}`;
        console.log('New Origin Path', DistributionConfig.Origins.Items[originIndex].OriginPath);
    }

    await cloudfront.updateDistribution({
        Id: distributions[environment],
        IfMatch: ETag,
        DistributionConfig,
    });

    // invalidate the cache
    console.log('Invalidating Cache')
    await cloudfront.createInvalidation({
        DistributionId: distributions[environment],
        InvalidationBatch: {
            Paths: {
                Quantity: 1, // must match number of entries in "Items"
                Items: ['/*'],
            },
            CallerReference: branch // use release branch as invalidation reference
        }
    }).promise();

    console.log('Done!');
};


try {
    handle().catch(error => core.setFailed(error.message));
} catch (error) {
    core.setFailed(error.message);
}