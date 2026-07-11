function formatDurationMs(durationMs) {
  const totalSeconds = Math.max(0, durationMs) / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const roundedSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function logE2eDuration(label, startedAt) {
  console.log(
    `[E2E timing] ${label}: ${formatDurationMs(Date.now() - startedAt)}`
  );
}

module.exports = {
  formatDurationMs,
  logE2eDuration,
};
