/** 
 * TODO:
 * function -> pageContext -> retrieve e.g. 'src' into extension context
 * build up table with video elements by number of 'src' in extension context
 * 
 * UI functionality:
 * - user selects video element
 * - forward selected element (by src) into speed control functionality
 * - default: first video element to be found on page
 * 
 * Example query Selector by src document.querySelector("video[src='blob:https://www.youtube.com/4125af81-c8ed-49eb-91f4-950c28676513']")
 *
 *	let videoElements = await chrome.scripting.executeScript({
 *		target: { tabId: (tab.id as number) },
 *		func: retrieveVideoElements,
 *	  });
 *
 *	function retrieveVideoElements(): any {
 *		let videoTags =  (document.getElementsByTagName("video")[0] as HTMLVideoElement).src;	
 *		console.log(videoTags)
 *		return videoTags 
 *	}
 *	console.log(videoElements);
 */
export async function adjustPlaybackrate(targetSpeed: number){
	let firstVideoElementOfPage = (document.getElementsByTagName("video")[0] as HTMLVideoElement)
	if(firstVideoElementOfPage){
		firstVideoElementOfPage.playbackRate = targetSpeed
	}
}

/**
 * retrieves some information about all available video tags of the current page/tab
 */
export async function retrieveVideoElements(){
	let videoElementsCollection =  (document.getElementsByTagName("video"))	
	const videoElements: any[] = [];
	for(let element of videoElementsCollection){
		videoElements.push({ src: element.src } )
	}
	return videoElements
}

