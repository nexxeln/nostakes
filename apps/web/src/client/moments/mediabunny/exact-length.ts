interface Found {
  readonly body: number;
  readonly end: number;
  readonly type: string;
}

const HEADER = 8;

const LARGE_HEADER = 16;

const WORD = 2 ** 32;

const typeAt = (view: DataView, at: number) =>
  String.fromCodePoint(
    view.getUint8(at + 4),
    view.getUint8(at + 5),
    view.getUint8(at + 6),
    view.getUint8(at + 7)
  );

const sizeAt = (view: DataView, at: number, to: number) => {
  const small = view.getUint32(at);

  if (small === 1) {
    return view.getUint32(at + 8) * WORD + view.getUint32(at + 12);
  }

  return small === 0 ? to - at : small;
};

const boxesIn = (
  view: DataView,
  from: number,
  to: number
): readonly Found[] => {
  const found: Found[] = [];
  let at = from;

  while (at + HEADER <= to) {
    const small = view.getUint32(at);
    const size = sizeAt(view, at, to);

    if (size < HEADER || at + size > to) {
      break;
    }

    found.push({
      body: at + (small === 1 ? LARGE_HEADER : HEADER),
      end: at + size,
      type: typeAt(view, at),
    });
    at += size;
  }

  return found;
};

const child = (view: DataView, parent: Found | undefined, type: string) =>
  parent === undefined
    ? undefined
    : boxesIn(view, parent.body, parent.end).find((box) => box.type === type);

const readTime = (view: DataView, at: number, wide: boolean) =>
  wide
    ? view.getUint32(at) * WORD + view.getUint32(at + 4)
    : view.getUint32(at);

const writeTime = (
  view: DataView,
  at: number,
  wide: boolean,
  value: number
) => {
  if (wide) {
    view.setUint32(at, Math.floor(value / WORD));
    view.setUint32(at + 4, value % WORD);
  } else {
    view.setUint32(at, value);
  }
};

const shortened = (view: DataView, at: number, wide: boolean, most: number) => {
  if (readTime(view, at, wide) > most) {
    writeTime(view, at, wide, most);
  }
};

const MVHD_TIMESCALE = { narrow: 12, wide: 20 };

const MVHD_DURATION = { narrow: 16, wide: 24 };

const TKHD_DURATION = { narrow: 20, wide: 28 };

const ELST_FIRST_SEGMENT = 8;

const HDLR_TYPE = 8;

export const playingFor = (buffer: ArrayBuffer, seconds: number) => {
  const view = new DataView(buffer);

  const moov = boxesIn(view, 0, view.byteLength).find(
    (box) => box.type === "moov"
  );

  const mvhd = child(view, moov, "mvhd");

  if (moov === undefined || mvhd === undefined) {
    throw new Error("the file has no movie header");
  }

  const wideMovie = view.getUint8(mvhd.body) === 1;

  const timescale = view.getUint32(
    mvhd.body + (wideMovie ? MVHD_TIMESCALE.wide : MVHD_TIMESCALE.narrow)
  );

  const most = Math.round(seconds * timescale);

  for (const trak of boxesIn(view, moov.body, moov.end)) {
    const hdlr = child(view, child(view, trak, "mdia"), "hdlr");
    const tkhd = child(view, trak, "tkhd");
    const elst = child(view, child(view, trak, "edts"), "elst");

    if (
      trak.type === "trak" &&
      hdlr !== undefined &&
      typeAt(view, hdlr.body + HDLR_TYPE - 4) === "soun" &&
      tkhd !== undefined
    ) {
      const wideTrack = view.getUint8(tkhd.body) === 1;

      shortened(
        view,
        tkhd.body + (wideTrack ? TKHD_DURATION.wide : TKHD_DURATION.narrow),
        wideTrack,
        most
      );

      if (elst !== undefined) {
        shortened(
          view,
          elst.body + ELST_FIRST_SEGMENT,
          view.getUint8(elst.body) === 1,
          most
        );
      }
    }
  }

  shortened(
    view,
    mvhd.body + (wideMovie ? MVHD_DURATION.wide : MVHD_DURATION.narrow),
    wideMovie,
    most
  );

  return buffer;
};
