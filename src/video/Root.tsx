import {Composition} from 'remotion';
import {sampleConfig} from '../samples';
import {ASPECTS, durationFrames, FPS, type VideoConfig} from './config';
import {TravelMap} from './TravelMap';

export const COMPOSITION_ID = 'TravelMap';

// 画幅和时长都由配置决定
export const Root: React.FC = () => (
	<Composition
		id={COMPOSITION_ID}
		component={TravelMap}
		fps={FPS}
		width={1080}
		height={1920}
		durationInFrames={durationFrames(sampleConfig('chengdu'))}
		defaultProps={sampleConfig('chengdu') as VideoConfig}
		calculateMetadata={({props}) => ({
			durationInFrames: durationFrames(props),
			width: ASPECTS[props.aspect].width,
			height: ASPECTS[props.aspect].height,
		})}
	/>
);
