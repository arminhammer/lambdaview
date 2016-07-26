# lambdaview
CLI tool that displays AWS Lambda function details, log messages, and errors

## installation

``` npm install -g lambdaview ```

## Usage

Run lambdaview from the command line. The only required flag is -f/--function, which expects the Lambda function name or ARN. An optional -r/--region is available to set the region (us-east-1 is the default).

``` $ lambdaview --function sqlTest ```