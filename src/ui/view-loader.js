// Lazy loader for the in-level network view (item 8).
//
// The 3D network view pulls in three.js, the largest dependency in the game.
// Loading it with a dynamic import keeps it out of the entry bundle, so the
// globe home screen and menus appear sooner. game.js prefetches the view when
// a briefing opens, so Begin Containment rarely waits on it.
//
// Pure apart from the importer it is given: the import promise is cached, and
// a failed import is forgotten so the next tap can retry.

export function createViewLoader(importer) {
    let pending = null;
    return {
        load() {
            if (!pending) {
                pending = Promise.resolve()
                    .then(importer)
                    .catch((err) => {
                        pending = null;
                        throw err;
                    });
            }
            return pending;
        },
        prefetch() {
            this.load().catch(() => {});
        },
    };
}
