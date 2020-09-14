/*
 * Copyright 2020 Adobe Inc. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * This action receives the initial request of processing the queue and creates schedulers to run it 
 */
const { Core, Files } = require('@adobe/aio-sdk')
const fetch = require('node-fetch')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')
const openwhisk = require('openwhisk')
const { v4: uuid4 } = require('uuid')

// main function that will be executed by Adobe I/O Runtime
async function main (params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    // 'info' is the default level if not set
    logger.info('Calling the main action')

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params))

    // check for missing request input parameters and headers
    const requiredParams = ['fileUrl', 'fileLocation', 'originalFileLocation']
    const requiredHeaders = []
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      // return and log client errors
      return errorResponse(400, errorMessage, logger)
    }

    const jobId = uuid4()
    const fileLocation = `public/${jobId}-links.csv`
    const originalFileLocation = `public/${jobId}-original.csv`

    let threshold = params.threshold || 100
    const interval = params.interval || 60
    const wsk = openwhisk()

    const toShortenRes = await fetch(params.fileUrl)

    const files = await Files.init()
    await files.write(fileLocation, toShortenRes.body)
    await files.copy(fileLocation, originalFileLocation)
    const props = await files.getProperties(fileLocation)
    logger.debug(JSON.stringify(props))

    const triggerParams = {
      minutes: interval,
      // stopDate: (new Date()).getTime() + 600000,
      trigger_payload: {
        threshold,
        jobId
      }
    }

    logger.debug(await wsk.triggers.create({ name: `${jobId}-bitly-trigger` }))
    logger.debug(await wsk.rules.create({name: `${jobId}-bitly-trigger-rule`, action: 'poc-throttled-external-api-0.0.1/process-list', trigger: `${jobId}-bitly-trigger`}))
    logger.debug(await wsk.feeds.create({feedName: '/whisk.system/alarms/interval', trigger: `${jobId}-bitly-trigger`, params: triggerParams}))

    const response = {
      statusCode: 200,
      body: props
    }

    return response
  } catch (error) {
    // log any server errors
    logger.error(error)
    // return with 500
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main
