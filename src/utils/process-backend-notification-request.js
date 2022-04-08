'use strict';

const processBackendNotificationRequest = require('@serverless/utils/process-backend-notification-request');
const colors = require('../cli/colors');

module.exports = (notifications, logger) => {
  const notification = processBackendNotificationRequest(notifications);
  if (!notification) return;

  logger.log();
  logger.log(colors.darkGray(notification.message));
};
