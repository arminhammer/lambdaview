#!/usr/bin/env node
'use strict'
/**
 * Created by arming on 7/25/16.
 */
const aws = require('aws-sdk')
const yargs = require('yargs')
const colors = require('colors')

let argv = yargs.argv;

let functionName = ''
let region = 'us-east-1'

if (argv.function) {
  functionName = argv.function
} else if (argv.f) {
  functionName = argv.f
} else {
  console.log('Please provide a function name or ARN to view');
  process.exit(0)
}

if(argv.region) {
  region = argv.region
} else if (argv.r) {
  region = argv.r
}

const lambda = new aws.Lambda({ region: region })
const logs = new aws.CloudWatchLogs({ region: region });

let output = {
  events: []
}

let logGroupName = ''

let promise = lambda.getFunction({
  FunctionName: functionName
}).promise()

promise.then((data) => {
  output.FunctionName = data.Configuration.FunctionName
  output.FunctionArn = data.Configuration.FunctionArn
  output.Runtime = data.Configuration.Runtime
  output.Role = data.Configuration.Role
  output.Handler = data.Configuration.Handler
  output.CodeSize = data.Configuration.CodeSize
  output.Description = data.Configuration.Description
  output.Timeout = data.Configuration.Timeout
  output.MemorySize = data.Configuration.MemorySize
  output.LastModified = data.Configuration.LastModified
  output.CodeSha256 = data.Configuration.CodeSha256
  output.Version = data.Configuration.Version
  output.VpcConfig = data.Configuration.VpcConfig
  logGroupName = '/aws/lambda/' + output.FunctionName
})
.then(() => {
  return logs.describeLogStreams({
    logGroupName: logGroupName
  }).promise()
})
.then((data) => {
  return Promise.all(data.logStreams.map((stream) => {
    return logs.getLogEvents({
      logGroupName: logGroupName,
      logStreamName: stream.logStreamName,
    }).promise()
  }));
})
.then((data) => {
  data.map((event) => {
    let buffer = {
      lines: []
    }
    let passedReport = false
    event.events.map((line) => {
      if(line.message.startsWith('START')) {
        if(buffer.lines.length > 0) {
          output.events.push(buffer)
        }
        buffer = {
          lines: []
        }
        passedReport = false
        buffer.startTime = line.timestamp
        let matches = line.message.match(/RequestId: ([0-9A-Za-z]+-[0-9A-Za-z]+-[0-9A-Za-z]+-[0-9A-Za-z]+-[0-9A-Za-z]+) Version: ([A-Za-z0-9$]+)/)
        buffer.requestId = matches[1]
        buffer.version = matches[2]
      } else if (line.message.startsWith('END')) {
        buffer.endTime = line.timestamp
      } else if (line.message.startsWith('REPORT')) {
        let matches = line.message.match(/RequestId: [0-9A-Za-z-]+\tDuration: (\d+.\d+ ms)\tBilled Duration: (\d+ ms) \tMemory Size: (\d+ MB)\tMax Memory Used: (\d+ MB)/)
        buffer.duration = matches[1]
        buffer.billedDuration = matches[2]
        buffer.memorySize = matches[3]
        buffer.maxMemoryUsed = matches[4]
        passedReport = true
      } else {
        if(passedReport) {
          if(!buffer.errors) {
            buffer.errors = []
          }
          buffer.errors.push(line)
        } else if(line.message.includes('errorMessage') || line.message.includes('Exception')) {
          if(!buffer.errors) {
            buffer.errors = []
          }
          buffer.errors.push(line)
        }
      }
      buffer.lines.push(line)
    })
    output.events.push(buffer)
  })
})
.then(() => {
  printOutput(output)
})
.catch((err) => {
  console.log(err, err.stack);
})

function printOutput(output) {
  console.log(output.FunctionName.green + ': ' + output.FunctionArn.yellow + ' ' + output.Runtime.white.bgMagenta.bold + ' ' + output.MemorySize.toString().bgGreen.white.bold+'MB'.bgGreen.white.bold + ' ' + output.Timeout.toString().bgCyan.white.bold + 'secs'.bgCyan.white.bold + ' ' + output.Version.bgYellow.white.bold + '\n')
  output.events.sort((a, b) => {
    if(a.startTime < b.startTime) return -1
    else if(a.startTime > b.startTime) return 1
    else return 0
  })
  output.events.map((event) => {
    console.log(new Date(event.startTime).toString().cyan.bold + ' ' + event.requestId.yellow.bold +' ' + event.maxMemoryUsed.toString().bgGreen.white.bold+'MB'.bgGreen.white.bold + ' ' + event.duration.white.bgMagenta.bold + ' ' + event.billedDuration.white.bgBlue.bold)
    event.lines.map((line) => {
      console.log(new Date(line.timestamp).toString().green + ' ' + line.message.trim())
    })
    if(event.errors) {
      event.errors.map((error) => {
        console.log(new Date(error.timestamp).toString().red.bold + ': ' + error.message.trim().white.bgRed.bold)
      })
    }
    console.log('\n')
  })
}