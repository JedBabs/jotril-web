import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Jotril AI'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: 'linear-gradient(to bottom right, #0E001F, #05000A)',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        fontSize: 160,
                        fontWeight: 900,
                        letterSpacing: '-0.05em',
                        color: '#EDF2FC',
                        fontFamily: 'sans-serif'
                    }}
                >
                    Jotril
                    <span style={{ color: '#06B6D4', marginLeft: 10 }}>AI</span>
                    <span style={{ color: '#06B6D4' }}>.</span>
                </div>
                <div
                    style={{
                        marginTop: 40,
                        fontSize: 32,
                        fontWeight: 600,
                        color: '#B56EFF',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        fontFamily: 'sans-serif'
                    }}
                >
                    AI Text Detection
                </div>
            </div>
        ),
        {
            ...size,
        }
    )
}
