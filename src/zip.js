import gulp from 'gulp'
import zip from 'gulp-zip'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pkg = require('../package.json')

gulp
  .src('build/**', { encoding: false })
  .pipe(zip(`Groupify-Auto-Tab-Organizer-${pkg.version}.zip`))
  .pipe(gulp.dest('package'))
