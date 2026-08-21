// The legacy SEED-SEB screens are plain JavaScript ported from the original CRA
// app. They are consumed only through lazy imports in route files, so an ambient
// `any` declaration is sufficient and keeps them out of strict typechecking.
declare module "@/legacy/*";
