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
 * This is a recursive action being called by the scheduler until the queue is completely processed
 */
const { Core, Files } = require('@adobe/aio-sdk')
const fetch = require('node-fetch')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')
const openwhisk = require('openwhisk')
const csv = require('csvtojson')
const { parse } = require('json2csv')
const util = require('util')

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
    const requiredParams = ['threshold', 'jobId']
    const requiredHeaders = []
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      // return and log client errors
      return errorResponse(400, errorMessage, logger)
    }

    const fileLocation = `public/${params.jobId}-links.csv`

    const wsk = openwhisk()
    const csvParams = {
      delimiter: ';'
    }
    let threshold = params.threshold
    const files = await Files.init()

    const csvFilePath = 'links.csv'

    await files.copy(fileLocation, csvFilePath, { localDest: true })
    const toShorten = await csv(csvParams).fromFile(csvFilePath)
    
    logger.info(JSON.stringify(toShorten))
    if (toShorten.length < threshold) {
      threshold = toShorten.length
    }
    
    const promises = toShorten.slice(0, threshold).map(async (item) => {
      logger.info(JSON.stringify(item))
      await wsk.actions.invoke({
        name: 'poc-throttled-external-api-0.0.1/url-shortener',
        blocking: false,
        result: false,
        params: { key: `${params.jobId}-${item.UrlId}`, longLink: item.longUrl, domain: item.Domain }
      })
    })
    await Promise.all(promises)

    const remaining = toShorten.slice(threshold)
    logger.debug(JSON.stringify(remaining))
    
    let responseMessage = 'next batch scheduled'

    // if end of queue, merge results and upload to ACC
    if (!remaining || remaining.length === 0) {
      await wsk.actions.invoke({
        name: 'poc-throttled-external-api-0.0.1/merge-results',
        blocking: false,
        result: false,
        params: { jobId: params.jobId }
      })
      responseMessage = 'queue completed'
    } else {
      // otherwise, save the remaining links
      const newCsv = parse(remaining, { delimiter: ';' })
      await files.write(fileLocation, newCsv)
      const props = await files.getProperties(fileLocation)
      logger.debug(JSON.stringify(props))
    }

    return {
      statusCode: 200,
      body: { message: responseMessage }
    }

  } catch (error) {
    // log any server errors
    logger.error(error)
    // return with 500
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main
