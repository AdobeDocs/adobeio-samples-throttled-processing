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
 * This action is called at the end of the process to merge and forward the end results
 */
const { Core, State, Files } = require('@adobe/aio-sdk')
const fetch = require('node-fetch')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')
const openwhisk = require('openwhisk')
const csv = require('csvtojson')
const { parse } = require('json2csv')
const https = require('https')

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
    const requiredParams = ['jobId', 'campaignNotificationEndpoint']
    const requiredHeaders = []
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      // return and log client errors
      return errorResponse(400, errorMessage, logger)
    }

    const originalFileLocation = `public/${params.jobId}-original.csv`

    const files = await Files.init()
    
    const csvFilePath = 'links.csv'
    const csvParams = {
      delimiter: ';'
    }

    await files.copy(originalFileLocation, csvFilePath, { localDest: true })
    const toShorten = await csv(csvParams).fromFile(csvFilePath)

    const state = await State.init()
    
    const promises = toShorten.map(async (item) => {
      const shortUrl = await state.get(`${params.jobId}-${item.UrlId}`)
      item['shortUrl'] = shortUrl.value
      return item
    })
    const newList = await Promise.all(promises)
    logger.debug(JSON.stringify(newList))

    const fileLocation = `public/${params.jobId}-results.csv`
    const newCsv = parse(newList, { delimiter: ';' })
    await files.write(fileLocation, newCsv)
    const props = await files.getProperties(fileLocation)
    logger.debug(JSON.stringify(props))

    const wsk = openwhisk()
    await wsk.feeds.delete({feedName: '/whisk.system/alarms/interval', trigger: `${params.jobId}-bitly-trigger`})
    await wsk.rules.delete({name: `${params.jobId}-bitly-trigger-rule`})
    await wsk.triggers.delete({ name: `${params.jobId}-bitly-trigger` })

    return {
      statusCode: 200,
      body: props
    }
  } catch (error) {
    // log any server errors
    logger.error(error)
    // return with 500
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main
