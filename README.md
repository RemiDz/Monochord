# Sound Journey Session Leader

A web-based binaural beat generator and sound healing companion app for the Feeltone Master Monochord KOTAMO.

## Features

- **Binaural Beat Generator**: Create harmonic drones with precise frequency control
- **432Hz & 440Hz Tuning**: Switch between standard and healing frequency systems
- **Guided Sessions**: 5-30 minute sessions with 5 phases (Settling, Deepening, Peak, Softening, Return)
- **Free Play Mode**: Unlimited session time with live interval selection
- **Live Effects**: Pulse, Pan Drift, Breath Guide, Volume Swell
- **Instrument Tuner**: Comprehensive tuning utility for all 3 instruments
  - Monochord (30 strings: 5×D2 + 20×D3 + 5×D2)
  - Tampura (4 strings: A2-D3-D3-D2)
  - Koto (12 strings: all D3)
- **Mobile Optimized**: Responsive design for iPad and iPhone

## Project Structure

```
Monochord/
├── index.html              # Main HTML structure
├── css/
│   └── styles.css         # All CSS styles (~88KB)
├── js/
│   └── app.js             # All JavaScript logic (~83KB)
├── 1.jpeg                 # Monochord side photo
├── 2.jpeg                 # Tampura/Koto side photo
└── index_backup.html      # Original single-file version (backup)
```

## Instrument Tuner

The tuner section allows you to:

1. **Switch Reference Pitch**: Toggle between 432Hz and 440Hz
2. **Transpose Root Note**: Change from D to any of the 12 chromatic notes
3. **Select Instrument**: Choose Monochord, Tampura, or Koto
4. **Play Reference Tones**: Press and hold string buttons to hear tuning tones
5. **Drone Mode**: Toggle to make tones play continuously
6. **Sweep Mode**: Auto-cycle through all strings (3s each)
7. **Interval Checks**: 
   - Octave Check: Play D2+D3 together
   - Fifth Check: Play D+A together

## Deployment

The app is deployed via GitHub Pages at:
**https://remidz.github.io/Monochord/**

## Technical Details

- **Single Page Application**: Pure HTML/CSS/JavaScript (no frameworks)
- **Web Audio API**: For all sound generation
- **Responsive Design**: Optimized for iPad (primary), iPhone, and desktop
- **iOS PWA Support**: Can be added to home screen
- **Wake Lock API**: Keeps screen active during sessions

## Development

To modify the app:

1. Edit `css/styles.css` for styling changes
2. Edit `js/app.js` for functionality changes
3. Edit `index.html` for structure changes

The original single-file version is preserved as `index_backup.html`.

## Credits

Created for sound healing sessions with the Feeltone Master Monochord KOTAMO.
