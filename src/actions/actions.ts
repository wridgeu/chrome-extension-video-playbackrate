import { VideoElementIdentifier } from '../../types';

/**
 * Select the specific video element on the page and adjust it's speed.
 * @param targetSpeed
 * @param targetElementSelector
 * @returns
 */
export async function adjustPlaybackrate(
    targetSpeed: number,
    targetElementSelector?: VideoElementIdentifier
): Promise<void> {
    const selectedVideoElement =
        (document.querySelector(`video[src='${targetElementSelector}']`) as HTMLVideoElement) ||
        (document.getElementsByTagName('video')[0] as HTMLVideoElement);

    if (!selectedVideoElement) throw new Error('No video element to be adjusted');

    selectedVideoElement.playbackRate = targetSpeed;
}

/**
 * retrieves some information about all available video tags of the current page/tab
 *
 * TODO:
 * build up table with video elements by number of 'src' in extension context
 *
 * UI functionality:
 * - user selects video element
 * - forward selected element (by src) into speed control functionality
 * - default: first video element to be found on page
 */
export function retrieveVideoElements(): VideoElementIdentifier[] {
    const videoElementsCollection = document.getElementsByTagName('video') as HTMLCollectionOf<HTMLVideoElement>;
    const videoElements: VideoElementIdentifier[] = [];

    for (const element of videoElementsCollection) {
        videoElements.push({
            src: element.src
        });
    }

    return videoElements;
}
