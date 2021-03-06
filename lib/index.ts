import ax, { AxiosRequestConfig } from 'axios';
import { YTPlaylist, YTvideo } from './interfaces';

export = fetchFromPlaylist;

const rqOpts: AxiosRequestConfig = {
    headers: {
        'User-Agent': 'hellobiczes',
        'x-youtube-client-name': 1,
        'x-youtube-client-version': '2.20200731.02.01'
    }
}

const baseURL = 'https://youtube.com';

/**
 * Scraps youtube playlist metadata and all its videos
 * @param url URL or ID of the playlist you want to scrap
 */
async function fetchFromPlaylist(url: string) : Promise<YTPlaylist> {
    let test = /[?&]list=([^#\&\?]+)|^([a-zA-Z0-9-_]+)$/.exec(url);
    if(!test)
        throw Error('Invalid playlist URL or ID');
    let playlistID = test[1] || test[2];
    let videos: YTvideo[] = [];
    let ytInitialData: any;

    try {
        let body = (await ax.get('https://youtube.com/playlist?list=' + encodeURI(playlistID), rqOpts)).data as string;
        ytInitialData = JSON.parse(/window\["ytInitialData"].*?({.*?});/s.exec(body)?.[1] || '{}');
    } catch {
        throw Error('Could not fetch/parse playlist');
    }

    if(ytInitialData.alerts)
        throw Error('This playlist is private');
    if(!ytInitialData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer)
        throw Error('Cannot find valid playlist JSON data. Is the playlist ID correct?');
    let listData = ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer;
    let d = ytInitialData;
    
    if(listData.contents)
        videos.push(...parseVideosFromJson(listData.contents));
    let contToken: string = listData?.continuations?.[0]?.nextContinuationData?.continuation || '';
    if(contToken)
        videos.push(...(await getAllVideos(contToken)));

    try {
        let mf = d.microformat.microformatDataRenderer;
        let si0 = d.sidebar.playlistSidebarRenderer.items[0].playlistSidebarPrimaryInfoRenderer;
        let si1 = d.sidebar.playlistSidebarRenderer.items[1].playlistSidebarSecondaryInfoRenderer.videoOwner.videoOwnerRenderer;
        return {
            title: mf.title,
            url: baseURL + '/playlist?list=' + listData.playlistId,
            id: listData.playlistId,
            video_count: +si0.stats[0].runs[0].text.replace(/[^0-9]/g, ''),
            view_count: +si0.stats[1].simpleText.replace(/[^0-9]/g, ''),
            description: mf.description,
            isUnlisted: mf.unlisted,
            thumbnail_url: mf.thumbnail.thumbnails.pop().url.replace(/\?.*/, ''),
            author: {
                name: si1.title.runs[0].text,
                url: baseURL + si1.title.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url,
                avatar_url: si1.thumbnail.thumbnails.pop().url
            },
            videos: videos
        }
    } catch {
        throw Error('Could not parse playlist metadata')
    }
}

function parseVideosFromJson(videoDataArray: any[]) : YTvideo[] {
    try {
        let videos: YTvideo[] = [];
        for(let v of videoDataArray.map(v => v.playlistVideoRenderer))
            try {
                videos.push({
                    title: v.title.runs[0].text,
                    url: baseURL + '/watch?v=' + v.videoId,
                    id: v.videoId,
                    length: v.lengthText.simpleText,
                    milis_length: +v.lengthSeconds * 1000,
                    thumbnail_url: 'https://i.ytimg.com/vi/' + v.videoId + '/hqdefault.jpg',
                    author: {
                        name: v.shortBylineText.runs[0].text,
                        url: baseURL + v.shortBylineText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url
                    }
            }   );
            } catch {
                continue;
            }
        return videos;
    } catch {
        throw Error('Could not parse videos from videoData JSON');
    }
}

async function getAllVideos(ajax_url: string, videos: YTvideo[] = []) : Promise<YTvideo[]> {
    try {
        let ytAppendData = (await ax.get(baseURL + '/browse_ajax?continuation=' + ajax_url, rqOpts)).data;
        videos.push(...parseVideosFromJson(ytAppendData[1].response.continuationContents.playlistVideoListContinuation.contents));
        let contToken: string = ytAppendData[1].response.continuationContents.playlistVideoListContinuation?.continuations?.[0]?.nextContinuationData?.continuation;
        return contToken ? await getAllVideos(contToken, videos) : videos;
    } catch {
        throw Error('An error has occured while trying to fetch more videos');
    }
}