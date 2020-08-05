const AWS = require('aws-sdk');
const core = require('@actions/core');
const github = require('@actions/github');
const cloudfront = new AWS.CloudFront();

const handle = async () => {
    const distributions = JSON.parse(core.getInput('distributions'));
    const originId = core.getInput('originId');
    console.log({
        context: github.context,
        repo: github.context.repo,
        env: process.env,
    });
    const project = github.context.repo.repo || null;
    const branch = github.context.ref.replace('refs/heads/', '')
    const environment = branch.split('/')[1] || null;

    if (!distributions[environment]) {
        console.log(`Exiting. No Distribution ID defined for '${environment}'`)
        return;
    }

    // get old configuration
    const result = await cloudfront.getDistributionConfig({ Id: distributions[environment] }).promise();
    const { ETag, DistributionConfig } = result
    
    // upload configuration with new OriginPath
    // For help with this, see ./example-cloudfront-config.json
    // or use aws-spear cloudfront get-distribution-config --id= "<DIST ID>" | tee
    await cloudfront.updateDistribution({
        Id: distributions[environment],
        IfMatch: ETag,
        DistributionConfig: {
            ...DistributionConfig,
            Origins: {
                ...DistributionConfig.Origins,
                Items: DistributionConfig.Origins.Items.map(origin => origin.Id !== originId ? origin : {
                    ...origin,
                    OriginPath: `${project}/${branch}`
                })
            }
        }
    });

    // invalidate the cache
    await cloudfront.createInvalidation({
        DistributionId: distributions[environment],
        InvalidationBatch: {
            Paths: {
                Quantity: 10000, // arbitrary number
                Items: ['/*'],
            },
            CallerReference: branch // use release branch as invalidation reference
        }
    }).promise();
};


try {
    handle().catch(error => core.setFailed(error.message));
} catch (error) {
    core.setFailed(error.message);
}