#!/usr/bin/env node
'use strict'
/**
 * Created by arming on 7/25/16.
 */
const aws = require('aws-sdk')
const yargs = require('yargs')
const colors = require('colors')

let argv = yargs.argv

let functionName = ''
let region = 'us-east-1'

if (argv.function) {
  functionName = argv.function
} else if (argv.f) {
  functionName = argv.f
} else {
  console.log('Please provide a function name or ARN to view')
  process.exit(0)
}

if (argv.region) {
  region = argv.region
} else if (argv.r) {
  region = argv.r
}

const lambda = new aws.Lambda({ region: region })
const logs = new aws.CloudWatchLogs({ region: region })

let output = {
  events: []
}

function createBuffer () {
  return {
    lines: [],
    requestId: '',
    startTime: 0,
    version: '',
    endTime: 0,
    duration: '',
    billedDuration: 0,
    memorySize: 0,
    maxMemoryUsed: 0
  }
}

let logGroupName = ''

let promise = lambda.getFunction({
  FunctionName: functionName
}).promise()

promise.then((data) => {
  output = Object.assign(output, data.Configuration)
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
      logStreamName: stream.logStreamName
    }).promise()
  }))
})
.then((data) => {
  data.map((event) => {
    let buffer = createBuffer()
    let passedReport = false
    event.events.map((line) => {
      if (line.message.startsWith('START')) {
        if (buffer.lines.length > 0 && buffer.startTime) {
          output.events.push(buffer)
          buffer = createBuffer()
          passedReport = false
        }
        buffer.startTime = line.timestamp
        let matches = line.message.match(/RequestId: ([0-9A-Za-z-]+) Version: ([A-Za-z0-9$]+)/)
        buffer.requestId = matches[1]
        buffer.version = matches[2]
      } else if (line.message.startsWith('END')) {
        buffer.endTime = line.timestamp
      } else if (line.message.startsWith('REPORT')) {
        let matches = line.message.match(/RequestId: [0-9A-Za-z-]+\tDuration: (\d+.\d+) ms\tBilled Duration: (\d+) ms \tMemory Size: (\d+) MB\tMax Memory Used: (\d+) MB/)
        buffer.duration = matches[1]
        buffer.billedDuration = matches[2]
        buffer.memorySize = matches[3]
        buffer.maxMemoryUsed = matches[4]
        passedReport = true
      } else {
        if (passedReport) {
          if (!buffer.errors) {
            buffer.errors = []
          }
          buffer.errors.push(line)
        } else if (line.message.includes('errorMessage') || line.message.includes('Exception') || line.message.includes('Error')) {
          if (!buffer.errors) {
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
  console.log(err, err.stack)
})

function printOutput (output) {
  console.log(colors.green(output.FunctionName) + ': ' + colors.yellow(output.FunctionArn) + ' ' + colors.white.bgMagenta.bold(output.Runtime) + ' ' + colors.bgGreen.white.bold(output.MemorySize.toString() + 'MB') + ' ' + colors.bgCyan.white.bold(output.Timeout.toString() + 'secs') + ' ' + colors.bgYellow.white.bold(output.Version) + '\n')
  output.events.sort((a, b) => {
    if (a.startTime < b.startTime) return -1
    else if (a.startTime > b.startTime) return 1
    else return 0
  })
  output.events.map((event) => {
    // TODO print out IAM policy
    // TODO add truncation of log messages
    // TODO just print out errors
    // TODO print out handler code
    console.log(colors.cyan.bold(new Date(event.startTime).toString()) + ' ' + colors.yellow.bold(event.requestId) + ' ' + colors.bgWhite.black.bold(event.maxMemoryUsed.toString() + 'MB') + '/' + colors.bgGreen.white.bold(output.MemorySize + 'MB') + ' ' + colors.white.bgMagenta.bold(event.duration + 'ms') + ' ' + colors.white.bgBlue.bold(event.billedDuration + 'ms'))
    event.lines.map((line) => {
      console.log(new Date(line.timestamp).toString().green + ' ' + line.message.trim())
    })
    if (event.errors) {
      event.errors.map((error) => {
        console.log(new Date(error.timestamp).toString().red.bold + ': ' + error.message.trim().white.bgRed.bold)
      })
    }
    console.log('\n')
  })
}
