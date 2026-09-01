# Measurement protocol

## Primary metric

Time from chapter navigation start to the intended current-page comic image being readable:

1. target image request has started;
2. response body has completed;
3. browser `HTMLImageElement.decode()` or Android Telephoto display state confirms decode/display;
4. Web waits two `requestAnimationFrame` callbacks before recording readable time.

Loading, skeleton, route response, JSON completion and Coil request success are supporting timestamps only.

## Web test matrix

- viewport 390x844, DPR 3;
- 4x CPU slowdown;
- 150ms RTT, 1.6Mbps down;
- cold browser cache and a separately labeled warm-cache run;
- chapter 585/P1 and stored restore P201;
- chapter 584/no-scroll correctness;
- at least 5 runs, compare medians and retain raw results.

Record navigation, chapter response, target request start/end, decode+2RAF, LCP element, priority, initial image count, duplicate URLs, active page and progress calls.

## Android test matrix

- same physical device and build per comparison;
- cold disk cache and separately labeled warm disk cache;
- direct entry, stored-page restore and sequential scrolling;
- at least 5 runs per scenario.

Record chapter API start/end, target image request start, Coil success, Telephoto displayed, prefetch URL/attempt/cancel counts, blank waits, per-page failures and process memory.

## Interpretation

- API improvements do not count as TTIR improvement unless target image request/readable timestamps improve.
- LCP is valid only when its element is the comic image.
- Cold CDN behavior and device decode must be separated.
- Structural counts are acceptable evidence for eliminated duplicate work, but not substitutes for end-to-end phone timing.
