<template>
  <div class='poster-frame' :style='paperStyle' v-html='overlay'></div>
</template>

<script>
/**
 * The poster as it will be exported: paper, borders, text, and a window where
 * the live map shows through. The map is panned and zoomed underneath it;
 * pointer events pass through the frame.
 */
import {computeLayout, overlaySVG, getPaperRatio, getFontUsages} from '../lib/poster/posterLayout.js';
import {loadFont} from '../lib/poster/fonts.js';

const MARGIN = 40;

export default {
  name: 'PosterFrame',
  props: {
    poster: {type: Object, required: true},
    // Space on the left taken by the settings panel, in pixels.
    insetLeft: {type: Number, default: 0}
  },
  emits: ['layout'],
  data() {
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      fontsVersion: 0
    };
  },
  computed: {
    effectiveInset() {
      // On narrow screens the panel covers everything anyway; use the full width.
      return this.viewportWidth - this.insetLeft < 320 ? 0 : this.insetLeft;
    },
    paperSize() {
      let ratio = getPaperRatio(this.poster);
      let availableWidth = Math.max(100, this.viewportWidth - this.effectiveInset - 2 * MARGIN);
      let availableHeight = Math.max(100, this.viewportHeight - 2 * MARGIN);
      let width = availableWidth;
      let height = width / ratio;
      if (height > availableHeight) {
        height = availableHeight;
        width = height * ratio;
      }
      return {width, height};
    },
    paperStyle() {
      let {width, height} = this.paperSize;
      return {
        width: width + 'px',
        height: height + 'px',
        left: this.effectiveInset + (this.viewportWidth - this.effectiveInset - width) / 2 + 'px',
        top: (this.viewportHeight - height) / 2 + 'px'
      };
    },
    layout() {
      // eslint-disable-next-line no-unused-expressions
      this.fontsVersion; // re-measure text once fonts are loaded
      let {width, height} = this.paperSize;
      return computeLayout(this.poster, width, height);
    },
    overlay() {
      return overlaySVG(this.layout, this.poster, null, 'screen');
    },
    fontKey() {
      return getFontUsages(this.poster).map(u => u.id + u.weight).join(',');
    }
  },
  watch: {
    fontKey: {
      immediate: true,
      handler() {
        Promise.all(getFontUsages(this.poster).map(u => loadFont(u.id, u.weight)))
          .then(() => this.fontsVersion += 1)
          .catch(err => console.error('Could not load fonts', err));
      }
    },
    layout() {
      this.$emit('layout');
    }
  },
  mounted() {
    window.addEventListener('resize', this.onResize);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.onResize);
  },
  methods: {
    onResize() {
      this.viewportWidth = window.innerWidth;
      this.viewportHeight = window.innerHeight;
    },
    getPaperRect() {
      return this.$el.getBoundingClientRect();
    },
    /**
     * Map window in client pixels.
     */
    getMapRect() {
      let paper = this.getPaperRect();
      let map = this.layout.map;
      if (map.shape === 'circle') {
        return new DOMRect(paper.left + map.cx - map.r, paper.top + map.cy - map.r, 2 * map.r, 2 * map.r);
      }
      return new DOMRect(paper.left + map.x, paper.top + map.y, map.w, map.h);
    }
  }
};
</script>

<style lang='stylus'>
.poster-frame {
  position: fixed;
  pointer-events: none;
  // Dims everything outside of the poster
  box-shadow: 0 0 0 200vmax rgba(30, 30, 30, 0.35), 0 4px 24px rgba(0, 0, 0, 0.35);
  z-index: 0;
  svg {
    display: block;
  }
}
</style>
