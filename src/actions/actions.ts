import { VideoElementIdentifier } from "../../types";

/**
 * Select the specific video element on the page and adjust it's speed.
 * @param targetSpeed 
 * @param targetElementSelector 
 * @returns 
 */
export async function adjustPlaybackrate(targetSpeed: number, targetElementSelector: VideoElementIdentifier): Promise<void> {

	// document.querySelector("video[src='blob:https://www.youtube.com/6f41fba5-eb61-4dbe-a636-40257a28d9d0'][class='video-stream html5-main-video']")
	// TODO: introduce dynamic attribute-query-creation: based on the amount of key fields, create a new query selector statement
	// alternatively only focus on the `src` attribute as it should be unique enough
	// let videoElementByQuery = (document.querySelector(`video[src='${targetElementSelector}'][class='${targetElementSelector.class.value}']`) as HTMLVideoElement)

	let selectedVideoElement = (document.querySelector(`video[src='${targetElementSelector}'][class='${targetElementSelector.class.value}']`) as HTMLVideoElement) 
								|| (document.getElementsByTagName("video")[0] as HTMLVideoElement)

	if(!selectedVideoElement) return

	selectedVideoElement.playbackRate = targetSpeed
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

	let videoElementsCollection =  (document.getElementsByTagName("video") as HTMLCollectionOf<HTMLVideoElement>)
	const videoElements: VideoElementIdentifier[] = [];

	for(let element of videoElementsCollection){
		videoElements.push(
			{ 
				class: element.classList,
				src: element.src 
			}
		)
	}

	return videoElements
}

