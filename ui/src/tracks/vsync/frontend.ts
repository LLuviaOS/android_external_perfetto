// Copyright (C) 2018 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {Actions} from '../../common/actions';
import {TrackState} from '../../common/state';
import {checkerboardExcept} from '../../frontend/checkerboard';
import {globals} from '../../frontend/globals';
import {Track} from '../../frontend/track';
import {trackRegistry} from '../../frontend/track_registry';

import {Config, Data, KIND} from './common';

// TODO(hjd): De-dupe this from ChromeSliceTrack, CpuSliceTrack and VsyncTrack.
const MARGIN_TOP = 5;
const RECT_HEIGHT = 30;

function getCurResolution() {
  // Truncate the resolution to the closest power of 10.
  const resolution = globals.frontendLocalState.timeScale.deltaPxToDuration(1);
  return Math.pow(10, Math.floor(Math.log10(resolution)));
}

class VsyncTrack extends Track<Config, Data> {
  static readonly kind = KIND;
  static create(trackState: TrackState): VsyncTrack {
    return new VsyncTrack(trackState);
  }

  private reqPending = false;

  constructor(trackState: TrackState) {
    super(trackState);
  }

  reqDataDeferred() {
    const {visibleWindowTime} = globals.frontendLocalState;
    const reqStart = visibleWindowTime.start - visibleWindowTime.duration;
    const reqEnd = visibleWindowTime.end + visibleWindowTime.duration;
    const reqRes = getCurResolution();
    this.reqPending = false;
    globals.dispatch(Actions.reqTrackData({
      trackId: this.trackState.id,
      start: reqStart,
      end: reqEnd,
      resolution: reqRes
    }));
  }

  renderCanvas(ctx: CanvasRenderingContext2D): void {
    const {timeScale, visibleWindowTime} = globals.frontendLocalState;

    const data = this.data();
    const inRange = data !== undefined &&
        (visibleWindowTime.start >= data.start &&
         visibleWindowTime.end <= data.end);
    if (!inRange || data === undefined ||
        data.resolution !== getCurResolution()) {
      if (!this.reqPending) {
        this.reqPending = true;
        setTimeout(() => this.reqDataDeferred(), 50);
      }
    }
    if (data === undefined) return;  // Can't possibly draw anything.

    const dataStartPx = timeScale.timeToPx(data.start);
    const dataEndPx = timeScale.timeToPx(data.end);
    const visibleStartPx = timeScale.timeToPx(visibleWindowTime.start);
    const visibleEndPx = timeScale.timeToPx(visibleWindowTime.end);

    checkerboardExcept(
        ctx, visibleStartPx, visibleEndPx, dataStartPx, dataEndPx);

    const bgColor = '#5E909B';
    const fgColor = '#323D48';

    const startPx = Math.floor(Math.max(dataStartPx, visibleStartPx));
    const endPx = Math.floor(Math.min(dataEndPx, visibleEndPx));

    ctx.fillStyle = bgColor;
    ctx.fillRect(startPx, MARGIN_TOP, endPx - startPx, RECT_HEIGHT);

    ctx.fillStyle = fgColor;
    for (let i = 0; i < data.vsyncs.length; i += 2) {
      const leftPx = Math.floor(timeScale.timeToPx(data.vsyncs[i]));
      const rightPx = Math.floor(timeScale.timeToPx(data.vsyncs[i + 1]));
      if (rightPx < startPx) continue;
      // TODO(hjd): Do some thing better when very zoomed out.
      if ((rightPx - leftPx) <= 1) continue;
      if (leftPx > endPx) break;
      ctx.fillRect(leftPx, MARGIN_TOP, rightPx - leftPx, RECT_HEIGHT);
    }
  }
}

trackRegistry.register(VsyncTrack);
