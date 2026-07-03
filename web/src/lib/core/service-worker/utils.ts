export function handleAutomaticUpdate(
	registration: ServiceWorkerRegistration,
	intervals: {idle: number; checks: number},
): NodeJS.Timeout {
	let lastFocusTime = performance.now();
	function wakeup(evt?: Event) {
		const timePassed = performance.now();
		if (timePassed - lastFocusTime > intervals.idle) {
			registration.update();
		}
		// we reset the time each time we wake up
		// the idea here is that we do not want to bother users while they are actively using the app
		lastFocusTime = timePassed;
	}
	['focus', 'pointerdown'].forEach((evt) =>
		window.addEventListener(evt, wakeup),
	);

	// We still trigger an update check every so often.
	// TODO: use a smarter interval/backoff for service-worker update checks.
	return setInterval(() => registration.update(), intervals.checks);
}

// taken from: https://stackoverflow.com/a/50535316
// with one adjustment: an install only counts as an available UPDATE when the
// page is already controlled by a previous worker. On the very first visit the
// first worker also passes through the 'installed' state, but that is an
// initial install, not an update; reporting it would show a spurious
// "Update Available" notice on every first load.
export function listenForWaitingServiceWorker(
	registration: ServiceWorkerRegistration,
	callback: (reg: ServiceWorkerRegistration) => void,
) {
	function awaitStateChange() {
		if (registration.installing) {
			registration.installing.addEventListener('statechange', function () {
				if (this.state === 'installed' && navigator.serviceWorker.controller)
					callback(registration);
			});
		}
	}
	if (!registration) {
		return;
	}
	if (registration.waiting) {
		return callback(registration);
	}
	if (registration.installing) {
		awaitStateChange();
	} else {
		registration.addEventListener('updatefound', awaitStateChange);
	}
}
